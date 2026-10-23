import { prisma } from "../../config/prisma";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { iepExtractionService } from "../iep/iepExtraction.service";
import { AcceptIepGoalsInput, ParentIepExtractInput } from "./parentIep.schemas";

export const parentIepService = {
  async extract(parentId: string, kidId: string, input: ParentIepExtractInput) {
    const kid = await assertOwnsKid(parentId, kidId);
    return iepExtractionService.extract(kid, input.source);
  },

  // Auto-creates goals with no review step (unlike the staff flow, which always has a human
  // pick/correct discipline+modality before POST /goals) -- onboarding has no room for a per-
  // candidate review screen. The tradeoff: only candidates the AI was confident enough about to
  // derive a real disciplineId get created; the rest are silently skipped rather than guessed at,
  // and the response says how many of each so the frontend can be honest about it ("added 2 of 3").
  // Modality is lower-stakes (how the child responds, not which specialty this belongs to) so a
  // missing one defaults to VERBAL instead of being skipped.
  async acceptGoals(parentId: string, kidId: string, input: AcceptIepGoalsInput) {
    const kid = await assertOwnsKid(parentId, kidId);

    const creatable = input.candidates.filter((c) => c.disciplineId !== null);
    const skipped = input.candidates.length - creatable.length;

    if (creatable.length === 0) return { created: 0, skipped };

    await prisma.goal.createMany({
      data: creatable.map((c) => ({
        tenantId: kid.tenantId,
        kidId: kid.id,
        canonicalSkillId: c.canonicalSkillId,
        disciplineId: c.disciplineId!,
        modality: c.modality ?? "VERBAL",
        title: c.title,
        confidence: c.confidence,
        rationale: c.sourceExcerpt
      }))
    });

    return { created: creatable.length, skipped };
  }
};
