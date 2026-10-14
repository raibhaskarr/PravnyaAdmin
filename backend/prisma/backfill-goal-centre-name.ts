// One-time data migration: Goal.centreName, Goal.confidence, and Goal.rationale all post-date the
// migration that added the columns, so every goal migrated from the reviewed POC tagging pipeline
// (sourceGoalId set) has them null even though the source PocGoalTag rows already carry this info.
// Idempotent -- only ever fills a currently-null field, never overwrites one that's already set
// (e.g. from the product's own create/edit flows), so it's safe to re-run.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const goals = await prisma.goal.findMany({
    where: { sourceGoalId: { not: null } },
    select: { id: true, sourceGoalId: true, canonicalSkillId: true, centreName: true, confidence: true, rationale: true }
  });
  console.log(`${goals.length} goal(s) with a source to check.`);

  let centreUpdated = 0;
  let centreSkippedConflict = 0;
  let centreSkippedNoSource = 0;
  let judgmentUpdated = 0;
  let judgmentSkippedNoMatch = 0;

  for (const goal of goals) {
    const tags = await prisma.pocGoalTag.findMany({
      where: { sourceGoalId: goal.sourceGoalId! },
      select: { centreName: true, confidence: true, rationale: true, predictedSkillId: true, modelProvider: true }
    });

    const data: { centreName?: string; confidence?: number; rationale?: string } = {};

    // Centre: an objective fact about the source document/enrollment, not a model's opinion -- must
    // be consistent across every tag for this source goal (any provider), so a real conflict here
    // means dirty source data, not model disagreement, and gets skipped rather than guessed.
    if (goal.centreName === null) {
      const centres = new Set(tags.map((t) => t.centreName).filter((c): c is string => c !== null));
      if (centres.size === 1) {
        data.centreName = [...centres][0];
        centreUpdated += 1;
      } else if (centres.size > 1) {
        console.warn(`Goal ${goal.id}: conflicting centreName values in source data (${[...centres].join(", ")}) -- skipped, needs manual review.`);
        centreSkippedConflict += 1;
      } else {
        centreSkippedNoSource += 1;
      }
    }

    // Confidence/rationale: each model's own judgment about the skill actually chosen for this
    // goal -- legitimately differs between providers (unlike centreName), so only consider tags
    // that predicted the SAME skill this goal actually ended up with, and prefer the claude one
    // (the same default this app uses everywhere else -- see ai.platform.ts) when more than one
    // provider agrees, falling back to whichever provider is present.
    if (goal.confidence === null || goal.rationale === null) {
      const matching = tags.filter((t) => t.predictedSkillId === goal.canonicalSkillId);
      const chosen = matching.find((t) => t.modelProvider === "claude") ?? matching[0];
      if (!chosen) {
        judgmentSkippedNoMatch += 1;
      } else {
        if (goal.confidence === null && chosen.confidence !== null) data.confidence = chosen.confidence;
        if (goal.rationale === null && chosen.rationale !== null) data.rationale = chosen.rationale;
        judgmentUpdated += 1;
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.goal.update({ where: { id: goal.id }, data });
    }
  }

  console.log(`Centre: updated ${centreUpdated}, skipped ${centreSkippedNoSource} with no source centre, ${centreSkippedConflict} with conflicting values.`);
  console.log(`Confidence/rationale: updated ${judgmentUpdated}, skipped ${judgmentSkippedNoMatch} with no tag matching the goal's final skill.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
