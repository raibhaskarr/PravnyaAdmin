import { PocEvidenceOutcome, PocGoalTagStatus, PocMeasurementType, PocModality, PocSupportLevel } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";

const skillSelect = { select: { id: true, name: true, domain: { select: { name: true } } } };
const itemSelect = { select: { id: true, displayName: true } };

export interface GoalTagImport {
  sourceGoalId: string | null;
  goalTitle: string;
  originalDomainName: string | null;
  originalCategory: string | null;
  centreName: string | null;
  predictedSkillId: string | null;
  confidence: number | null;
  rationale: string | null;
  status: PocGoalTagStatus;
}

export interface LogEvidenceImport {
  logDate: string | null;
  centreName: string | null;
  predictedSkillId: string | null;
  itemHint: string | null;
  predictedItemId: string | null;
  itemMatchScore: number | null;
  itemMatchMethod: string | null;
  outcome: PocEvidenceOutcome;
  supportLevel: PocSupportLevel;
  modality: PocModality;
  measurementType: PocMeasurementType | null;
  measurementNumerator: number | null;
  measurementDenominator: number | null;
  measurementValue: number | null;
  measurementUnit: string | null;
  measurementBoolean: boolean | null;
  measurementText: string | null;
  confidence: number | null;
}

export interface ImportPayload {
  label: string;
  sourceChildId: string;
  modelProvider: string;
  modelName: string;
  goalTags: GoalTagImport[];
  logEvidence: LogEvidenceImport[];
}

export const pocReviewService = {
  async listChildren() {
    const children = await prisma.pocReviewChild.findMany({
      include: { _count: { select: { goalTags: true, logEvidence: true } } },
      orderBy: { label: "asc" }
    });
    return children;
  },

  async getChildDetail(childId: string) {
    const child = await prisma.pocReviewChild.findUnique({
      where: { id: childId },
      include: {
        goalTags: { include: { predictedSkill: skillSelect }, orderBy: { createdAt: "asc" } },
        logEvidence: { include: { predictedSkill: skillSelect, predictedItem: itemSelect }, orderBy: { logDate: "asc" } }
      }
    });
    if (!child) throw notFound("Review child not found");
    return child;
  },

  // Re-importing wipes and replaces this child's rows for that specific model provider only --
  // idempotent across prompt iterations within one pass, while letting a Gemini pass and a Claude
  // pass coexist side-by-side for comparison instead of one clobbering the other.
  async importData(payload: ImportPayload) {
    const child = await prisma.pocReviewChild.upsert({
      where: { sourceChildId: payload.sourceChildId },
      create: { label: payload.label, sourceChildId: payload.sourceChildId },
      update: { label: payload.label }
    });

    await prisma.$transaction([
      prisma.pocGoalTag.deleteMany({ where: { childId: child.id, modelProvider: payload.modelProvider } }),
      prisma.pocLogEvidence.deleteMany({ where: { childId: child.id, modelProvider: payload.modelProvider } }),
      prisma.pocGoalTag.createMany({
        data: payload.goalTags.map((g) => ({
          childId: child.id,
          sourceGoalId: g.sourceGoalId,
          goalTitle: g.goalTitle,
          originalDomainName: g.originalDomainName,
          originalCategory: g.originalCategory,
          centreName: g.centreName,
          predictedSkillId: g.predictedSkillId,
          confidence: g.confidence,
          rationale: g.rationale,
          status: g.status,
          modelProvider: payload.modelProvider,
          modelName: payload.modelName
        }))
      }),
      prisma.pocLogEvidence.createMany({
        data: payload.logEvidence.map((e) => ({
          childId: child.id,
          logDate: e.logDate ? new Date(e.logDate) : null,
          centreName: e.centreName,
          predictedSkillId: e.predictedSkillId,
          itemHint: e.itemHint,
          predictedItemId: e.predictedItemId,
          itemMatchScore: e.itemMatchScore,
          itemMatchMethod: e.itemMatchMethod,
          outcome: e.outcome,
          supportLevel: e.supportLevel,
          modality: e.modality,
          measurementType: e.measurementType,
          measurementNumerator: e.measurementNumerator,
          measurementDenominator: e.measurementDenominator,
          measurementValue: e.measurementValue,
          measurementUnit: e.measurementUnit,
          measurementBoolean: e.measurementBoolean,
          measurementText: e.measurementText,
          confidence: e.confidence,
          modelProvider: payload.modelProvider,
          modelName: payload.modelName
        }))
      })
    ]);

    return { childId: child.id, goalTagsImported: payload.goalTags.length, logEvidenceImported: payload.logEvidence.length };
  },

  // Flags are never stored -- computed fresh from current PocGoalTag/PocLogEvidence on every call,
  // then correlated against whatever PocReviewDecision rows already exist so a resolved flag still
  // shows as resolved even after the next re-import regenerates the tags/evidence underneath it.
  async getReviewFlags(childId: string) {
    const child = await prisma.pocReviewChild.findUnique({
      where: { id: childId },
      include: {
        goalTags: { include: { predictedSkill: skillSelect } },
        logEvidence: { include: { predictedSkill: skillSelect } }
      }
    });
    if (!child) throw notFound("Review child not found");

    const decisions = await prisma.pocReviewDecision.findMany({ where: { childId } });
    const disagreementDecision = (sourceGoalId: string) =>
      decisions.find((d) => d.kind === "GOAL_DISAGREEMENT" && d.sourceGoalId === sourceGoalId) ?? null;
    const evidenceDecision = (canonicalSkillId: string) =>
      decisions.find((d) => d.kind === "EVIDENCE_WITHOUT_GOAL" && d.canonicalSkillId === canonicalSkillId) ?? null;

    const bySourceGoal = new Map<string, typeof child.goalTags>();
    for (const g of child.goalTags) {
      if (!g.sourceGoalId) continue;
      const list = bySourceGoal.get(g.sourceGoalId) ?? [];
      list.push(g);
      bySourceGoal.set(g.sourceGoalId, list);
    }
    const disagreements = [...bySourceGoal.entries()]
      .filter(([, tags]) => new Set(tags.filter((t) => t.predictedSkillId).map((t) => t.predictedSkillId)).size > 1)
      .map(([sourceGoalId, tags]) => ({
        sourceGoalId,
        goalTitle: tags[0].goalTitle,
        tags: tags.map((t) => ({
          modelProvider: t.modelProvider,
          predictedSkill: t.predictedSkill,
          confidence: t.confidence,
          rationale: t.rationale
        })),
        decision: disagreementDecision(sourceGoalId)
      }));

    const skillIdsWithGoals = new Set(child.goalTags.filter((g) => g.predictedSkillId).map((g) => g.predictedSkillId));
    const evidenceBySkill = new Map<string, { skillId: string; skill: (typeof child.logEvidence)[number]["predictedSkill"]; count: number; providers: Set<string> }>();
    for (const e of child.logEvidence) {
      if (!e.predictedSkillId || skillIdsWithGoals.has(e.predictedSkillId)) continue;
      const existing = evidenceBySkill.get(e.predictedSkillId);
      if (existing) {
        existing.count += 1;
        existing.providers.add(e.modelProvider);
      } else {
        evidenceBySkill.set(e.predictedSkillId, { skillId: e.predictedSkillId, skill: e.predictedSkill, count: 1, providers: new Set([e.modelProvider]) });
      }
    }
    const evidenceWithoutGoal = [...evidenceBySkill.values()].map((s) => ({
      canonicalSkillId: s.skillId,
      skill: s.skill,
      evidenceCount: s.count,
      providers: [...s.providers],
      decision: evidenceDecision(s.skillId)
    }));

    return { disagreements, evidenceWithoutGoal };
  },

  async resolveReviewFlag(
    childId: string,
    decidedById: string,
    input: {
      kind: "GOAL_DISAGREEMENT" | "EVIDENCE_WITHOUT_GOAL";
      sourceGoalId: string | null;
      canonicalSkillId: string | null;
      resolvedSkillId: string | null;
      resolvedSource: string;
      note: string | null;
    }
  ) {
    const existing = await prisma.pocReviewDecision.findFirst({
      where: { childId, kind: input.kind, sourceGoalId: input.sourceGoalId, canonicalSkillId: input.canonicalSkillId }
    });
    const data = {
      resolvedSkillId: input.resolvedSkillId,
      resolvedSource: input.resolvedSource,
      note: input.note,
      decidedById,
      decidedAt: new Date()
    };
    if (existing) return prisma.pocReviewDecision.update({ where: { id: existing.id }, data });
    return prisma.pocReviewDecision.create({
      data: { childId, kind: input.kind, sourceGoalId: input.sourceGoalId, canonicalSkillId: input.canonicalSkillId, ...data }
    });
  }
};
