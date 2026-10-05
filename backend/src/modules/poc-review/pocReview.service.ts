import { Modality, PocEvidenceOutcome, PocGoalTagStatus, PocMeasurementType, PocModality, PocSupportLevel } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";

const skillSelect = { select: { id: true, name: true, domain: { select: { name: true } } } };
const itemSelect = { select: { id: true, displayName: true } };
const REAL_MODALITIES = new Set(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"]);

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

export interface GoalSuggestionImport {
  canonicalSkillId: string;
  suggestedGoalId: string | null;
  suggestedGoalTitle: string | null;
  confidence: number | null;
  rationale: string | null;
}

export interface SuggestionImportPayload {
  sourceChildId: string;
  modelProvider: string;
  modelName: string;
  suggestions: GoalSuggestionImport[];
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

  // Replace-on-import per child -- a suggestion is a point-in-time best-effort search, not
  // provider-scoped like goalTags/logEvidence (only one provider runs this reverse pass at a time;
  // see the local pipeline's match-evidence-to-goals.ts for why).
  async importGoalSuggestions(payload: SuggestionImportPayload) {
    const child = await prisma.pocReviewChild.findUnique({ where: { sourceChildId: payload.sourceChildId } });
    if (!child) throw notFound("Review child not found -- import goals/evidence for this child first");

    await prisma.$transaction([
      prisma.pocEvidenceGoalSuggestion.deleteMany({ where: { childId: child.id } }),
      prisma.pocEvidenceGoalSuggestion.createMany({
        data: payload.suggestions.map((s) => ({
          childId: child.id,
          canonicalSkillId: s.canonicalSkillId,
          suggestedGoalId: s.suggestedGoalId,
          suggestedGoalTitle: s.suggestedGoalTitle,
          confidence: s.confidence,
          rationale: s.rationale,
          modelProvider: payload.modelProvider,
          modelName: payload.modelName
        }))
      })
    ]);

    return { childId: child.id, suggestionsImported: payload.suggestions.length };
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
    const suggestions = await prisma.pocEvidenceGoalSuggestion.findMany({ where: { childId } });
    const disagreementDecision = (sourceGoalId: string) =>
      decisions.find((d) => d.kind === "GOAL_DISAGREEMENT" && d.sourceGoalId === sourceGoalId) ?? null;
    const evidenceDecision = (canonicalSkillId: string) =>
      decisions.find((d) => d.kind === "EVIDENCE_WITHOUT_GOAL" && d.canonicalSkillId === canonicalSkillId) ?? null;
    const evidenceSuggestion = (canonicalSkillId: string) => suggestions.find((s) => s.canonicalSkillId === canonicalSkillId) ?? null;

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
      decision: evidenceDecision(s.skillId),
      suggestion: evidenceSuggestion(s.skillId)
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
      resolvedSourceGoalId: string | null;
      resolvedSource: string;
      note: string | null;
    }
  ) {
    const existing = await prisma.pocReviewDecision.findFirst({
      where: { childId, kind: input.kind, sourceGoalId: input.sourceGoalId, canonicalSkillId: input.canonicalSkillId }
    });
    const data = {
      resolvedSkillId: input.resolvedSkillId,
      resolvedSourceGoalId: input.resolvedSourceGoalId,
      resolvedSource: input.resolvedSource,
      note: input.note,
      decidedById,
      decidedAt: new Date()
    };
    if (existing) return prisma.pocReviewDecision.update({ where: { id: existing.id }, data });
    return prisma.pocReviewDecision.create({
      data: { childId, kind: input.kind, sourceGoalId: input.sourceGoalId, canonicalSkillId: input.canonicalSkillId, ...data }
    });
  },

  // One-time (but safely re-runnable) migration: turns reviewed POC mappings into real Goal/
  // GoalItem/GoalItemEvidence rows under a real Kid. Only migrates what's actually resolved --
  // clean goal-skill tags, disagreements with a recorded decision, and evidence-without-goal
  // skills a human explicitly linked to a goal -- everything else is skipped and reported, never
  // silently guessed. Idempotent via Goal.sourceGoalId: re-running skips goals already migrated.
  async migrateToKid(childId: string, kidId: string) {
    const child = await prisma.pocReviewChild.findUnique({
      where: { id: childId },
      include: {
        goalTags: { include: { predictedSkill: skillSelect } },
        logEvidence: true,
        reviewDecisions: true
      }
    });
    if (!child) throw notFound("Review child not found");

    const kid = await prisma.kid.findUnique({ where: { id: kidId } });
    if (!kid) throw notFound("Kid not found");

    const bySourceGoal = new Map<string, typeof child.goalTags>();
    for (const g of child.goalTags) {
      if (!g.sourceGoalId) continue;
      const list = bySourceGoal.get(g.sourceGoalId) ?? [];
      list.push(g);
      bySourceGoal.set(g.sourceGoalId, list);
    }

    const disagreementDecisions = new Map(
      child.reviewDecisions.filter((d) => d.kind === "GOAL_DISAGREEMENT" && d.sourceGoalId).map((d) => [d.sourceGoalId as string, d])
    );

    type Resolved = { sourceGoalId: string; goalTitle: string; skillId: string };
    const resolved: Resolved[] = [];
    const skipped: { sourceGoalId: string; goalTitle: string; reason: string }[] = [];

    for (const [sourceGoalId, tags] of bySourceGoal) {
      const taggedSkillIds = new Set(tags.filter((t) => t.predictedSkillId).map((t) => t.predictedSkillId as string));
      const goalTitle = tags[0].goalTitle;
      if (taggedSkillIds.size === 0) {
        skipped.push({ sourceGoalId, goalTitle, reason: "no taxonomy match from either provider" });
      } else if (taggedSkillIds.size === 1) {
        resolved.push({ sourceGoalId, goalTitle, skillId: [...taggedSkillIds][0] });
      } else {
        const decision = disagreementDecisions.get(sourceGoalId);
        if (decision?.resolvedSkillId) {
          resolved.push({ sourceGoalId, goalTitle, skillId: decision.resolvedSkillId });
        } else {
          skipped.push({ sourceGoalId, goalTitle, reason: "providers disagree and it's not resolved yet -- review on the Review flags tab" });
        }
      }
    }

    // Evidence-without-goal skills a reviewer explicitly linked to a real goal ride along as extra
    // GoalItems under that goal, even though their own skill differs from the goal's own skill --
    // this is the whole point of that flow: one real goal legitimately covering several skills.
    const linkedSkillsByGoal = new Map<string, string[]>();
    let evidenceLinkedCount = 0;
    let evidenceStillOpenCount = 0;
    for (const d of child.reviewDecisions) {
      if (d.kind !== "EVIDENCE_WITHOUT_GOAL" || !d.canonicalSkillId) continue;
      if (d.resolvedSourceGoalId) {
        const list = linkedSkillsByGoal.get(d.resolvedSourceGoalId) ?? [];
        list.push(d.canonicalSkillId);
        linkedSkillsByGoal.set(d.resolvedSourceGoalId, list);
        evidenceLinkedCount += 1;
      }
    }
    const decidedEvidenceSkillIds = new Set(
      child.reviewDecisions.filter((d) => d.kind === "EVIDENCE_WITHOUT_GOAL" && d.canonicalSkillId).map((d) => d.canonicalSkillId as string)
    );
    const skillIdsWithGoals = new Set(child.goalTags.filter((g) => g.predictedSkillId).map((g) => g.predictedSkillId as string));
    const evidenceSkillIds = new Set(
      child.logEvidence.filter((e) => e.predictedSkillId && !skillIdsWithGoals.has(e.predictedSkillId)).map((e) => e.predictedSkillId as string)
    );
    for (const skillId of evidenceSkillIds) {
      if (!decidedEvidenceSkillIds.has(skillId)) evidenceStillOpenCount += 1;
    }

    const created: { sourceGoalId: string; goalId: string; goalTitle: string; skillName: string; itemCount: number; evidenceCount: number }[] = [];

    for (const r of resolved) {
      const existingGoal = await prisma.goal.findUnique({ where: { sourceGoalId: r.sourceGoalId } });
      if (existingGoal) {
        skipped.push({ sourceGoalId: r.sourceGoalId, goalTitle: r.goalTitle, reason: "already migrated" });
        continue;
      }

      const skill = await prisma.canonicalSkill.findUnique({
        where: { id: r.skillId },
        select: { name: true, defaultDisciplineId: true, supportedModalities: true }
      });
      if (!skill || !skill.defaultDisciplineId) {
        skipped.push({ sourceGoalId: r.sourceGoalId, goalTitle: r.goalTitle, reason: "matched skill has no default discipline set in the taxonomy" });
        continue;
      }

      const relevantSkillIds = new Set([r.skillId, ...(linkedSkillsByGoal.get(r.sourceGoalId) ?? [])]);
      const evidenceRows = child.logEvidence.filter((e) => e.predictedSkillId && relevantSkillIds.has(e.predictedSkillId));

      const modalityCounts = new Map<string, number>();
      for (const e of evidenceRows) {
        if (REAL_MODALITIES.has(e.modality)) modalityCounts.set(e.modality, (modalityCounts.get(e.modality) ?? 0) + 1);
      }
      const bestModality = [...modalityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const modality = (bestModality ?? skill.supportedModalities[0] ?? "VERBAL") as Modality;

      const result = await prisma.$transaction(async (tx) => {
        const goal = await tx.goal.create({
          data: {
            tenantId: kid.tenantId,
            kidId,
            canonicalSkillId: r.skillId,
            disciplineId: skill.defaultDisciplineId!,
            modality,
            title: r.goalTitle,
            status: "ACTIVE",
            sourceGoalId: r.sourceGoalId
          }
        });

        // Same item-bucketing the review page itself uses, so a promoted Goal's items match what a
        // reviewer already saw: one real item bucket per matched CanonicalSkillItem, one per distinct
        // unmatched hint, and a single "general practice" bucket for everything else.
        const buckets = new Map<string, { canonicalSkillItemId: string | null; customText: string | null; rows: typeof evidenceRows }>();
        for (const e of evidenceRows) {
          let key: string;
          let canonicalSkillItemId: string | null = null;
          let customText: string | null = null;
          if (e.itemMatchMethod === "ai" && e.predictedItemId) {
            key = `item:${e.predictedItemId}`;
            canonicalSkillItemId = e.predictedItemId;
          } else if (e.itemMatchMethod === "ai_no_match" && e.itemHint) {
            const normalized = e.itemHint.trim().toLowerCase();
            key = `text:${normalized}`;
            customText = normalized;
          } else {
            key = "general";
          }
          const bucket = buckets.get(key) ?? { canonicalSkillItemId, customText, rows: [] as typeof evidenceRows };
          bucket.rows.push(e);
          buckets.set(key, bucket);
        }

        let evidenceCount = 0;
        for (const bucket of buckets.values()) {
          const item = await tx.goalItem.create({
            data: { goalId: goal.id, canonicalSkillItemId: bucket.canonicalSkillItemId, customText: bucket.customText }
          });
          await tx.goalItemEvidence.createMany({
            data: bucket.rows.map((e) => ({
              goalItemId: item.id,
              logDate: e.logDate,
              centreName: e.centreName,
              outcome: e.outcome,
              supportLevel: e.supportLevel,
              modality: e.modality,
              measurementType: e.measurementType,
              measurementValue: e.measurementValue,
              measurementUnit: e.measurementUnit,
              measurementBoolean: e.measurementBoolean,
              measurementText: e.measurementText,
              confidence: e.confidence,
              sourceChildId: child.sourceChildId
            }))
          });
          evidenceCount += bucket.rows.length;
        }

        return { goalId: goal.id, itemCount: buckets.size, evidenceCount };
      });

      created.push({ sourceGoalId: r.sourceGoalId, goalId: result.goalId, goalTitle: r.goalTitle, skillName: skill.name, itemCount: result.itemCount, evidenceCount: result.evidenceCount });
    }

    return { created, skipped, evidenceLinkedAndMigrated: evidenceLinkedCount, evidenceStillNeedsReview: evidenceStillOpenCount };
  }
};
