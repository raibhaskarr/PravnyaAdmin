// One-time data migration: creates a Centre row for every distinct (case-insensitively grouped)
// centreName value across Goal and GoalItemEvidence, then backfills centreId on every row that
// has a centreName but no centreId yet. Idempotent -- only ever fills a currently-null centreId,
// and centre creation itself is find-or-create (same logic centres.service.ts's live create() uses,
// so a re-run or a live write since the last run can never create a duplicate Centre), so it's
// safe to re-run. Does NOT touch or drop centreName -- see docs/manual/03-business-logic.md.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const goals = await prisma.goal.findMany({ where: { centreName: { not: null } }, select: { id: true, centreName: true } });
  const evidence = await prisma.goalItemEvidence.findMany({ where: { centreName: { not: null } }, select: { id: true, centreName: true } });
  console.log(`${goals.length} goal(s) and ${evidence.length} evidence row(s) with a centreName to backfill.`);

  // Group case-insensitively (trim + lowercase as the key) across BOTH tables, so a casing variant
  // in Goal and a different casing in GoalItemEvidence still collapse to one Centre, not two.
  const casingCountsByKey = new Map<string, Map<string, number>>();
  function record(name: string) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    const casings = casingCountsByKey.get(key) ?? new Map<string, number>();
    casings.set(trimmed, (casings.get(trimmed) ?? 0) + 1);
    casingCountsByKey.set(key, casings);
  }
  for (const g of goals) record(g.centreName!);
  for (const e of evidence) record(e.centreName!);

  // Canonical casing per group: most-frequent exact string, ties broken by first-seen (Map
  // iteration order is insertion order).
  const canonicalNameByKey = new Map<string, string>();
  for (const [key, casings] of casingCountsByKey) {
    let best: string | null = null;
    let bestCount = -1;
    for (const [casing, count] of casings) {
      if (count > bestCount) {
        best = casing;
        bestCount = count;
      }
    }
    canonicalNameByKey.set(key, best!);
  }
  console.log(`${canonicalNameByKey.size} distinct centre(s) found (case-insensitive).`);

  const centreIdByKey = new Map<string, string>();
  for (const [key, name] of canonicalNameByKey) {
    const existing = await prisma.centre.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    const centre = existing ?? (await prisma.centre.create({ data: { name } }));
    centreIdByKey.set(key, centre.id);
    console.log(existing ? `Reusing existing Centre "${centre.name}".` : `Created Centre "${centre.name}".`);
  }

  let goalsUpdated = 0;
  for (const g of goals) {
    const centreId = centreIdByKey.get(g.centreName!.trim().toLowerCase())!;
    const result = await prisma.goal.updateMany({ where: { id: g.id, centreId: null }, data: { centreId } });
    goalsUpdated += result.count;
  }

  let evidenceUpdated = 0;
  for (const e of evidence) {
    const centreId = centreIdByKey.get(e.centreName!.trim().toLowerCase())!;
    const result = await prisma.goalItemEvidence.updateMany({ where: { id: e.id, centreId: null }, data: { centreId } });
    evidenceUpdated += result.count;
  }

  console.log(`Backfilled centreId on ${goalsUpdated} goal(s) and ${evidenceUpdated} evidence row(s) across ${centreIdByKey.size} centre(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
