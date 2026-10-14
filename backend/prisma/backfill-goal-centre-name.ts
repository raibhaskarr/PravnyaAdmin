// One-time data migration: Goal.centreName didn't exist until the migration that added it, so
// every goal migrated from the reviewed POC tagging pipeline (sourceGoalId set) has it null, even
// though the source PocGoalTag rows already carried a real centreName (sourced from
// IEPGoalCenterEnrollment -> CenterEnrollment.centerName in PranTrackingSystem). Idempotent -- only
// ever fills a currently-null centreName, never overwrites one that's already set (e.g. from the
// product's own create/edit flows), so it's safe to re-run.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const goals = await prisma.goal.findMany({
    where: { sourceGoalId: { not: null }, centreName: null },
    select: { id: true, sourceGoalId: true }
  });
  console.log(`${goals.length} goal(s) with a source but no centreName yet.`);

  let updated = 0;
  let skippedConflict = 0;
  let skippedNoSource = 0;

  for (const goal of goals) {
    const tags = await prisma.pocGoalTag.findMany({
      where: { sourceGoalId: goal.sourceGoalId!, centreName: { not: null } },
      select: { centreName: true }
    });
    const distinctCentres = new Set(tags.map((t) => t.centreName));

    if (distinctCentres.size === 0) {
      skippedNoSource += 1;
      continue;
    }
    if (distinctCentres.size > 1) {
      console.warn(`Goal ${goal.id}: conflicting centreName values in source data (${[...distinctCentres].join(", ")}) -- skipped, needs manual review.`);
      skippedConflict += 1;
      continue;
    }

    await prisma.goal.update({ where: { id: goal.id }, data: { centreName: [...distinctCentres][0] } });
    updated += 1;
  }

  console.log(`Updated ${updated}. Skipped ${skippedNoSource} with no matching source centre, ${skippedConflict} with conflicting values.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
