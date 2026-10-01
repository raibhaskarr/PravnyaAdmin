import { PocEvidenceOutcome, PocGoalTagStatus, PocSupportLevel } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";

const skillSelect = { select: { id: true, name: true, domain: { select: { name: true } } } };
const itemSelect = { select: { id: true, displayName: true } };

export interface GoalTagImport {
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
          confidence: e.confidence,
          modelProvider: payload.modelProvider,
          modelName: payload.modelName
        }))
      })
    ]);

    return { childId: child.id, goalTagsImported: payload.goalTags.length, logEvidenceImported: payload.logEvidence.length };
  }
};
