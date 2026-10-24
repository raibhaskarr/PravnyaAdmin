import { type Goal } from "../api/client";
import { type ActivityCandidate, buildActivityCandidates } from "../activities/Activities";
import { type GrowthGoalView, type GrowthMoment, buildGrowthGoals, buildGrowthMoments } from "../growth/Growth";

// Home's own digest of the same Goal[] data Growth/Activities already compute from -- the
// "conversation based" Home originally pictured was a real feed, not a single static welcome
// card. Reuses buildGrowthGoals/buildGrowthMoments/buildActivityCandidates as the single source of
// truth (exported from their own tabs for exactly this) rather than re-deriving the trend/gap
// logic a second time here.

export type FeedItem =
  | { kind: "growth"; goal: GrowthGoalView }
  | { kind: "activity"; candidate: ActivityCandidate }
  | { kind: "moment"; moment: GrowthMoment };

// Capped on purpose -- this is a quick scan on Home, not the full Growth/Activities tabs. One
// headline growth goal (same "pick the up-trending one first" rule Growth's own hero card uses),
// up to 2 home-try suggestions, up to 2 recent moments.
export function buildFeed(goals: Goal[]): FeedItem[] {
  const growthGoals = buildGrowthGoals(goals);
  const activityCandidates = buildActivityCandidates(goals);
  const moments = buildGrowthMoments(goals, 2);

  const items: FeedItem[] = [];

  const topGrowthGoal = growthGoals.find((g) => g.trend === "up") ?? growthGoals[0];
  if (topGrowthGoal) items.push({ kind: "growth", goal: topGrowthGoal });

  for (const candidate of activityCandidates.slice(0, 2)) items.push({ kind: "activity", candidate });
  for (const moment of moments) items.push({ kind: "moment", moment });

  return items;
}

function formatDate(date: string | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const EYEBROW: Record<FeedItem["kind"], string> = {
  growth: "Growth highlight",
  activity: "Try this at home",
  moment: "Milestone"
};

function FeedMessage({ item, kidName }: { item: FeedItem; kidName: string }) {
  if (item.kind === "growth") {
    const g = item.goal;
    return (
      <p className="text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">
        {kidName} is {g.statusPhrase.toLowerCase()} on "{g.goalTitle}" — {g.evidenceCount} moment{g.evidenceCount === 1 ? "" : "s"} logged.
      </p>
    );
  }
  if (item.kind === "activity") {
    const c = item.candidate;
    const date = formatDate(c.suggestedDate);
    return (
      <p className="text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">
        Confirmed at <b className="font-semibold">{c.suggestedCentreName}</b>
        {date ? ` on ${date}` : ""} — try "<b className="font-semibold">{c.suggestedItemLabel}</b>" at home and log what happens.
      </p>
    );
  }
  const m = item.moment;
  return (
    <p className="text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">
      <b className="font-semibold">{m.goalTitle}</b> — {m.title}
    </p>
  );
}

export function FeedCard({ item, kidName, onNavigate }: { item: FeedItem; kidName: string; onNavigate: (view: "growth" | "activities") => void }) {
  const target = item.kind === "activity" ? "activities" : "growth";
  return (
    <button type="button" onClick={() => onNavigate(target)} className="rounded-2xl bg-[var(--pv-surface)] px-4 py-3 text-left transition hover:bg-[var(--pv-green-100)]/40">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">🤖</span>
        <span className="text-[0.72rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">{EYEBROW[item.kind]}</span>
      </div>
      <FeedMessage item={item} kidName={kidName} />
    </button>
  );
}
