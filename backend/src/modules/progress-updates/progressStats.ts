import { prisma } from "../../config/prisma";

// The figures a progress update rests on, computed from the kid's real evidence -- never by the
// model. The AI draft only words these; the fallback template renders them directly.

export type GoalPeriodStats = {
  goalId: string;
  goalTitle: string;
  domain: string;
  entries: number;
  correct: number;
  independent: number;
  partial: number;
  atHome: number;
  atCentre: number;
  /** Item names practised successfully this period, e.g. "snack", "bye" (at most 4). */
  examples: string[];
  /** Items done correctly AND independently for the first time ever in this period. */
  firstTimeIndependent: string[];
  /** Compared with the same-length period just before; null when there's too little data to say. */
  trend: "up" | "steady" | "down" | null;
};

export type PeriodStats = {
  kidName: string;
  from: string;
  to: string;
  totalEntries: number;
  goals: GoalPeriodStats[];
  /** Active goals with nothing logged in the period. */
  notPractised: string[];
};

const DAY = 86_400_000;

// "Snack" (a shared item) and "snack" (typed by hand) are the same thing to a reader.
function hasName(list: string[], name: string) {
  return list.some((n) => n.toLowerCase() === name.toLowerCase());
}

function rate(correct: number, entries: number) {
  return entries ? correct / entries : 0;
}

export async function buildPeriodStats(kidId: string, from: Date, to: Date): Promise<PeriodStats> {
  const kid = await prisma.kid.findUniqueOrThrow({ where: { id: kidId }, select: { firstName: true } });
  const goals = await prisma.goal.findMany({
    where: { kidId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      canonicalSkill: { select: { domain: { select: { name: true } } } },
      items: {
        select: {
          customText: true,
          canonicalSkillItem: { select: { displayName: true } },
          evidence: { where: { logDate: { lte: to } }, select: { logDate: true, createdAt: true, outcome: true, supportLevel: true, centreId: true, centreName: true } }
        }
      }
    }
  });

  const length = Math.max(DAY, to.getTime() - from.getTime());
  const prevFrom = new Date(from.getTime() - length);
  const out: GoalPeriodStats[] = [];
  const notPractised: string[] = [];

  for (const g of goals) {
    const s: GoalPeriodStats = { goalId: g.id, goalTitle: g.title, domain: g.canonicalSkill.domain.name, entries: 0, correct: 0, independent: 0, partial: 0, atHome: 0, atCentre: 0, examples: [], firstTimeIndependent: [], trend: null };
    let prevEntries = 0;
    let prevCorrect = 0;
    for (const item of g.items) {
      const name = item.canonicalSkillItem?.displayName ?? item.customText ?? "";
      let independentBefore = false;
      let independentNow = false;
      for (const e of item.evidence) {
        const when = e.logDate ?? e.createdAt;
        const independent = e.outcome === "CORRECT" && e.supportLevel === "INDEPENDENT";
        if (when < from) {
          if (independent) independentBefore = true;
          if (when >= prevFrom) {
            prevEntries++;
            if (e.outcome === "CORRECT") prevCorrect++;
          }
          continue;
        }
        s.entries++;
        if (e.outcome === "CORRECT") {
          s.correct++;
          if (name && !hasName(s.examples, name) && s.examples.length < 4) s.examples.push(name);
        }
        if (e.outcome === "PARTIAL") s.partial++;
        if (independent) {
          s.independent++;
          independentNow = true;
        }
        if (e.centreId || e.centreName) s.atCentre++;
        else s.atHome++;
      }
      if (independentNow && !independentBefore && name && !hasName(s.firstTimeIndependent, name)) s.firstTimeIndependent.push(name);
    }
    if (s.entries === 0) {
      notPractised.push(g.title);
      continue;
    }
    if (s.entries >= 2 && prevEntries >= 2) {
      const diff = rate(s.correct, s.entries) - rate(prevCorrect, prevEntries);
      s.trend = diff >= 0.15 ? "up" : diff <= -0.15 ? "down" : "steady";
    }
    out.push(s);
  }

  out.sort((a, b) => b.entries - a.entries);
  return {
    kidName: kid.firstName,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    totalEntries: out.reduce((n, g) => n + g.entries, 0),
    goals: out,
    notPractised
  };
}
