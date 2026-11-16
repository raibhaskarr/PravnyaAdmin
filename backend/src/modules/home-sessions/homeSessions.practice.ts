import { prisma } from "../../config/prisma";
import type { GoalForDraft } from "./homeSessions.ai";

// Practice sessions Pravnya puts together on the parent's request (an extension of Activities):
// a 10-15 minute mix of the child's goals, chosen from what the child is working on at the centre
// and how they've been doing. Plain rules, no AI: the AI (when there is one) only writes the
// wording for the activities picked here.

const DAY = 86_400_000;
/** At most this many practice sessions a day per child (started ones; one left with no tries doesn't count). */
export const PRACTICE_PER_DAY = 2;
/** About 25 seconds a try, plus a minute to set up each activity: ~28 tries is 12-15 minutes. */
export const TRY_BUDGET = 28;
export const MAX_ACTIVITIES = 3;
const ITEMS_PER_ACTIVITY = 3;

export type ItemHistory = { centre: boolean; at: Date; correct: boolean; independent: boolean };

export type Candidate = {
  goalId: string;
  title: string;
  skill: string;
  area: string;
  measurementType: string | null;
  items: { goalItemId: string; label: string; history: ItemHistory[] }[];
};

type ScoredItem = { goalItemId: string; label: string; score: number; independentRate: number | null; mastered: boolean };

/**
 * How much an item needs practice at home now: worked on at the centre lately, not yet done on
 * its own, and not practised at home in the last week score highest. An item done on its own the
 * last 5 times is "mastered" and only kept for an easy start.
 */
export function scoreItem(history: ItemHistory[], now: Date): Omit<ScoredItem, "goalItemId" | "label"> {
  const recent = [...history].sort((a, b) => b.at.getTime() - a.at.getTime());
  const last5 = recent.slice(0, 5);
  const independentRate = last5.length ? last5.filter((h) => h.correct && h.independent).length / last5.length : null;
  const mastered = last5.length === 5 && independentRate === 1;
  const centreLately = recent.some((h) => h.centre && now.getTime() - h.at.getTime() <= 30 * DAY);
  const homeThisWeek = recent.filter((h) => !h.centre && now.getTime() - h.at.getTime() <= 7 * DAY).length;
  let score = 0;
  if (centreLately) score += 3;
  score += 2 * (1 - (independentRate ?? 0.5));
  if (homeThisWeek === 0) score += 1.5;
  score -= 0.3 * Math.min(homeThisWeek, 6);
  if (mastered) score -= 4;
  return { score, independentRate, mastered };
}

export type PracticePick = {
  goals: (GoalForDraft & { trialsPerItem: number })[];
  totalTries: number;
  minutes: number;
};

/**
 * Picks up to 3 goals (different areas where possible; goals from the last practice session go
 * later in line so sessions vary), their 2-3 items most in need of practice, and the number of
 * tries so the whole session is about 10-15 minutes. The easiest activity goes first, for a
 * confident start. Null when no goal has items to practise.
 */
export function pickPractice(candidates: Candidate[], lastTimeGoalIds: string[], now = new Date()): PracticePick | null {
  const goals = candidates
    .map((g) => {
      const items = g.items
        .filter((i) => i.label)
        .map((i) => ({ goalItemId: i.goalItemId, label: i.label, ...scoreItem(i.history, now) }))
        .sort((a, b) => b.score - a.score);
      const learning = items.filter((i) => !i.mastered);
      // A goal whose items are all mastered still counts, as an easy, confident activity.
      const chosen = (learning.length ? learning : items).slice(0, ITEMS_PER_ACTIVITY);
      const score = (chosen[0]?.score ?? -Infinity) - (lastTimeGoalIds.includes(g.goalId) ? 2 : 0) - (learning.length ? 0 : 3);
      const rates = chosen.map((i) => i.independentRate).filter((r): r is number => r !== null);
      const ease = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
      return { g, chosen, score, ease };
    })
    .filter((x) => x.chosen.length);
  if (!goals.length) return null;

  // Greedy: the highest score first, with a nudge towards areas not yet in the session.
  const picked: typeof goals = [];
  const pool = [...goals];
  while (picked.length < MAX_ACTIVITIES && pool.length) {
    const areas = new Set(picked.map((p) => p.g.area));
    pool.sort((a, b) => b.score - (areas.has(b.g.area) ? 1.5 : 0) - (a.score - (areas.has(a.g.area) ? 1.5 : 0)));
    picked.push(pool.shift()!);
  }
  picked.sort((a, b) => b.ease - a.ease);

  const itemCount = picked.reduce((n, p) => n + p.chosen.length, 0);
  const trialsPerItem = Math.max(2, Math.min(4, Math.floor(TRY_BUDGET / itemCount)));
  const totalTries = itemCount * trialsPerItem;
  return {
    goals: picked.map((p) => {
      const history = p.g.items.flatMap((i) => i.history).filter((h) => now.getTime() - h.at.getTime() <= 30 * DAY);
      return {
        id: p.g.goalId,
        title: p.g.title,
        skill: p.g.skill,
        area: p.g.area,
        measurementType: p.g.measurementType,
        items: p.chosen.map((i) => ({ goalItemId: i.goalItemId, label: i.label })),
        recent: history.length
          ? { entries: history.length, correct: history.filter((h) => h.correct).length, independent: history.filter((h) => h.correct && h.independent).length }
          : null,
        trialsPerItem
      };
    }),
    totalTries,
    minutes: Math.round(totalTries * (25 / 60) + picked.length)
  };
}

/** The child's active goals with items and the last 60 days of entries, shaped for pickPractice. */
export async function loadCandidates(kidId: string, now = new Date()): Promise<Candidate[]> {
  const since = new Date(now.getTime() - 60 * DAY);
  const goals = await prisma.goal.findMany({
    where: { kidId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      canonicalSkill: { select: { name: true, measurementType: true, domain: { select: { name: true } } } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          customText: true,
          canonicalSkillItem: { select: { displayName: true } },
          evidence: {
            where: { OR: [{ logDate: { gte: since } }, { logDate: null, createdAt: { gte: since } }] },
            select: { logDate: true, createdAt: true, outcome: true, supportLevel: true, centreId: true, centreName: true }
          }
        }
      }
    }
  });
  return goals.map((g) => ({
    goalId: g.id,
    title: g.title,
    skill: g.canonicalSkill.name,
    area: g.canonicalSkill.domain.name,
    measurementType: g.canonicalSkill.measurementType,
    items: g.items.map((i) => ({
      goalItemId: i.id,
      label: i.customText ?? i.canonicalSkillItem?.displayName ?? "",
      history: i.evidence.map((e) => ({
        centre: !!(e.centreId || e.centreName),
        at: e.logDate ?? e.createdAt,
        correct: e.outcome === "CORRECT",
        independent: e.supportLevel === "INDEPENDENT"
      }))
    }))
  }));
}
