import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { extractEvidenceService } from "../ai/extractEvidence.service";
import { ParentCreateEvidenceInput, ParentExtractEvidenceInput } from "./parentGoals.schemas";

const centreSelect = { select: { id: true, name: true } };

// Same shape as the staff-facing goals.service.ts's includeRelations, minus the `kid` relation --
// redundant here, the caller already knows which kid (it's in the URL).
const includeRelations = {
  canonicalSkill: { select: { id: true, name: true, measurementType: true, domain: { select: { id: true, name: true } } } },
  discipline: { select: { id: true, name: true } },
  centre: centreSelect,
  items: {
    include: {
      canonicalSkillItem: { select: { id: true, displayName: true } },
      evidence: { orderBy: { logDate: "desc" as const }, include: { centre: centreSelect } }
    }
  }
};

export const parentGoalsService = {
  async listGoals(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    return prisma.goal.findMany({ where: { kidId }, include: includeRelations, orderBy: { createdAt: "desc" } });
  },

  // Never persists anything -- same contract as the staff-side extractEvidenceService.extract(),
  // which this just calls directly after the ownership check. Saving an approved candidate still
  // goes through createEvidence() below, same as a manually-entered log.
  async extractEvidence(parentId: string, kidId: string, input: ParentExtractEvidenceInput) {
    const kid = await assertOwnsKid(parentId, kidId);
    const serviceInput = input.freeText !== undefined ? { freeText: input.freeText } : { media: input.media! };
    return extractEvidenceService.extract(kid, serviceInput);
  },

  // Mirrors goals.service.ts's createEvidence() find-or-create-item logic exactly -- a parent
  // logging from home shouldn't need to pre-create a GoalItem any more than a therapist does.
  async createEvidence(parentId: string, kidId: string, goalId: string, input: ParentCreateEvidenceInput) {
    await assertOwnsKid(parentId, kidId);

    const goal = await prisma.goal.findUnique({ where: { id: goalId }, include: { canonicalSkill: { select: { measurementType: true } } } });
    // Checked against the kidId from the URL, not just "does this goal exist" -- a goalId that's
    // real but belongs to a different kid (even one this same parent owns) must still 404, not
    // silently log evidence against the wrong kid's goal.
    if (!goal || goal.kidId !== kidId) throw notFound("Goal not found");

    let goalItemId = input.goalItemId;
    if (!goalItemId) {
      const customText = input.newItemCustomText?.trim() || null;
      const existing = await prisma.goalItem.findFirst({
        where: customText ? { goalId, customText: { equals: customText, mode: "insensitive" } } : { goalId, customText: null, canonicalSkillItemId: null }
      });
      const item = existing ?? (await prisma.goalItem.create({ data: { goalId, customText } }));
      goalItemId = item.id;
    } else {
      const item = await prisma.goalItem.findUnique({ where: { id: goalItemId } });
      if (!item || item.goalId !== goalId) throw notFound("Goal item not found on this goal");
    }

    return prisma.goalItemEvidence.create({
      data: {
        goalItemId,
        logDate: new Date(input.logDate),
        centreId: input.centreId ?? null,
        outcome: input.outcome,
        supportLevel: input.supportLevel,
        modality: input.modality,
        measurementType: goal.canonicalSkill.measurementType,
        measurementValue: input.measurementValue ?? null,
        measurementUnit: input.measurementUnit ?? null,
        measurementBoolean: input.measurementBoolean ?? null,
        measurementText: input.measurementText ?? null
      },
      include: {
        centre: centreSelect,
        goalItem: { select: { id: true, customText: true, canonicalSkillItem: { select: { id: true, displayName: true } } } }
      }
    });
  }
};
