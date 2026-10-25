import { useEffect, useState } from "react";
import { api, ApiError, type Goal, type GoalItem, type GoalItemEvidence } from "../api/client";
import mark from "../brand/mark.svg";

// Faithful port of PravnyaAdmin admin panel's realGrowth.tsx -- the "finalized" Growth design,
// same computation logic, same visual structure (hero highlight, stat tiles, Simple/Detailed
// toggle, domain-grouped goals with glyph bars, moments teaser, item drill-down). Rebuilt fresh
// for this app's own Tailwind/--pv-* token system rather than importing the admin panel's
// gp-prefixed CSS -- same design, not shared code.

const OUTCOME_LEVEL: Record<string, number> = {
  CORRECT: 4,
  PARTIAL: 3,
  ATTEMPTED: 2,
  INCORRECT: 1,
  NOT_OBSERVED: 1,
  UNKNOWN: 1
};

function levelFor(outcome: string): number {
  return OUTCOME_LEVEL[outcome] ?? 1;
}

function environmentLabel(centreName: string | null): string {
  return centreName ?? "Home";
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function formatEnvironments(envs: string[]): string {
  if (envs.length === 0) return "no logged moments yet";
  if (envs.length === 1) return envs[0] === "Home" ? "Home only so far" : `${envs[0]} only so far`;
  return envs.join(" & ");
}

const OUTCOME_LABEL: Record<string, string> = {
  CORRECT: "Did it on their own",
  PARTIAL: "Needed a little help",
  ATTEMPTED: "Gave it a try",
  INCORRECT: "Still learning this",
  NOT_OBSERVED: "Didn't get a chance to try",
  UNKNOWN: "Logged, outcome unclear"
};

function outcomeLabel(outcome: string): string {
  return OUTCOME_LABEL[outcome] ?? outcome;
}

const MODALITY_LABEL: Record<string, string> = {
  VERBAL: "Said it",
  MANUAL_SIGN: "Signed it",
  AAC: "Used AAC",
  WRITTEN: "Wrote it",
  GESTURAL: "Pointed / gestured"
};

function modalityLabel(modality: string): string | null {
  return MODALITY_LABEL[modality] ?? null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs} sec`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs} sec`;
}

function measurementLabel(e: Pick<GoalItemEvidence, "measurementType" | "measurementValue" | "measurementUnit" | "measurementBoolean" | "measurementText">): string | null {
  switch (e.measurementType) {
    case "FREQUENCY":
      return e.measurementValue != null ? `${e.measurementValue} ${e.measurementUnit ?? "times"}` : null;
    case "DURATION":
      return e.measurementValue != null ? formatDuration(e.measurementValue) : null;
    case "PERCENTAGE":
      return e.measurementValue != null ? `${Math.round(e.measurementValue)}%` : null;
    case "RATING":
      return e.measurementValue != null ? `Rated ${e.measurementValue}/5` : null;
    case "YES_NO":
      return e.measurementBoolean == null ? null : e.measurementBoolean ? "Yes" : "Not yet";
    case "FREE_OBSERVATION":
      return e.measurementText ?? null;
    default:
      return null;
  }
}

function itemLabel(item: GoalItem): string {
  return item.customText ?? item.canonicalSkillItem?.displayName ?? "General practice";
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface EvidenceWithItem extends GoalItemEvidence {
  itemLabel: string;
  itemName: string | null;
}

function allEvidenceWithItem(goal: Goal): EvidenceWithItem[] {
  return goal.items
    .flatMap((i) => i.evidence.map((e) => ({ ...e, itemLabel: itemLabel(i), itemName: i.customText ?? i.canonicalSkillItem?.displayName ?? null })))
    .sort((a, b) => (a.logDate ?? "").localeCompare(b.logDate ?? ""));
}

export interface GrowthGoalView {
  goalId: string;
  skillName: string;
  domainName: string;
  goalTitle: string;
  evidenceCount: number;
  environments: string[];
  glyphLevels: number[];
  statusPhrase: string;
  trend: "up" | "steady" | "emerging";
  recentItems: string[];
  goal: Goal;
}

function recentItemNames(goal: Goal, limit = 4): string[] {
  const withDate = goal.items
    .map((i) => ({ label: itemLabel(i), latest: i.evidence[0]?.logDate ?? null }))
    .sort((a, b) => (b.latest ?? "").localeCompare(a.latest ?? ""));
  const seen = new Set<string>();
  const names: string[] = [];
  for (const x of withDate) {
    const key = x.label.toLowerCase();
    if (seen.has(key) || !x.latest) continue;
    seen.add(key);
    names.push(x.label);
    if (names.length >= limit) break;
  }
  return names;
}

export function buildGrowthGoals(goals: Goal[]): GrowthGoalView[] {
  const views: GrowthGoalView[] = [];
  for (const g of goals) {
    const sorted = allEvidenceWithItem(g);
    if (sorted.length === 0) continue;
    const glyphLevels = sorted.slice(-5).map((e) => levelFor(e.outcome));
    const environments = [...new Set(sorted.map((e) => environmentLabel(e.centreName)))];

    const half = Math.max(1, Math.floor(sorted.length / 2));
    const earlyAvg = average(sorted.slice(0, half).map((e) => levelFor(e.outcome)));
    const recentAvg = average(sorted.slice(-half).map((e) => levelFor(e.outcome)));

    let trend: GrowthGoalView["trend"];
    let statusPhrase: string;
    if (sorted.length < 3) {
      trend = "emerging";
      statusPhrase = "Just starting to show up";
    } else if (recentAvg - earlyAvg >= 0.6) {
      trend = "up";
      statusPhrase = "Getting more independent";
    } else if (recentAvg >= 3.3) {
      trend = "steady";
      statusPhrase = "Steady — doing this well";
    } else {
      trend = "steady";
      statusPhrase = "Still building this";
    }

    views.push({
      goalId: g.id,
      skillName: g.canonicalSkill.name,
      domainName: g.canonicalSkill.domain.name,
      goalTitle: g.title,
      evidenceCount: sorted.length,
      environments,
      glyphLevels,
      statusPhrase,
      trend,
      recentItems: recentItemNames(g),
      goal: g
    });
  }
  return views.sort((a, b) => b.evidenceCount - a.evidenceCount);
}

export interface GrowthMoment {
  date: string;
  goalTitle: string;
  title: string;
  environment: string;
}

export function buildGrowthMoments(goals: Goal[], limit = 10): GrowthMoment[] {
  const moments: GrowthMoment[] = [];
  for (const g of goals) {
    const sorted = allEvidenceWithItem(g).filter((e) => e.logDate);
    if (!sorted.length) continue;
    const seenEnv = new Set<string>();
    let firstCorrectFound = false;
    for (const e of sorted) {
      const env = environmentLabel(e.centreName);
      const isNewEnv = !seenEnv.has(env);
      const hadSeenAnyEnv = seenEnv.size > 0;
      seenEnv.add(env);
      if (e.outcome === "CORRECT" && !firstCorrectFound) {
        firstCorrectFound = true;
        const title = e.itemName ? `Got "${e.itemName}" right for the first time` : "First independent success";
        moments.push({ date: e.logDate!, goalTitle: g.title, title, environment: env });
      } else if (isNewEnv && hadSeenAnyEnv) {
        moments.push({ date: e.logDate!, goalTitle: g.title, title: `First time this showed up at ${env}`, environment: env });
      }
    }
  }
  return moments.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

function groupByDomain(goals: GrowthGoalView[]): [string, GrowthGoalView[]][] {
  const map = new Map<string, GrowthGoalView[]>();
  for (const g of goals) {
    const arr = map.get(g.domainName) ?? [];
    arr.push(g);
    map.set(g.domainName, arr);
  }
  return [...map.entries()].sort((a, b) => b[1].reduce((n, s) => n + s.evidenceCount, 0) - a[1].reduce((n, s) => n + s.evidenceCount, 0));
}

const GLYPH_COLOR: Record<number, string> = {
  1: "var(--pv-border)",
  2: "var(--pv-orange-100)",
  3: "var(--pv-orange-500)",
  4: "var(--pv-green-500)"
};
const GLYPH_HEIGHT: Record<number, string> = { 1: "30%", 2: "55%", 3: "75%", 4: "100%" };

function Glyph({ levels }: { levels: number[] }) {
  return (
    <div className="flex flex-shrink-0 flex-col items-center gap-1">
      <div className="flex h-5 items-end gap-[3px]">
        {levels.map((lvl, i) => (
          <span key={i} className="w-1.5 rounded-sm" style={{ height: GLYPH_HEIGHT[lvl], background: GLYPH_COLOR[lvl] }} />
        ))}
      </div>
      <div className="whitespace-nowrap text-[0.58rem] font-bold text-[var(--pv-ink-faint)]">last {levels.length}</div>
    </div>
  );
}

function GlyphLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-[0.76rem] font-bold text-[var(--pv-green-700)]">
        <span className="flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--pv-green-700)] text-[0.64rem] italic">i</span>
        What do the colored bars mean?
      </button>
      {open ? (
        <div className="mt-2 rounded-xl border border-[var(--pv-green-100)] bg-[var(--pv-green-100)]/40 px-3.5 py-2.5 text-[0.78rem] leading-relaxed text-[var(--pv-ink-soft)]">
          Each bar is one of the most recent tries at that goal, oldest on the left. Taller and greener means more independent; shorter
          and lighter means more help was needed.
        </div>
      ) : null}
    </div>
  );
}

function GoalRow({ goal, showEvidence, onSelect }: { goal: GrowthGoalView; showEvidence: boolean; onSelect: (goalId: string) => void }) {
  return (
    <button type="button" onClick={() => onSelect(goal.goalId)} className="flex w-full items-center gap-2.5 border-b border-[var(--pv-border)] py-3.5 text-left last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[0.9rem] font-semibold text-[var(--pv-ink)]">{goal.goalTitle}</div>
        <div className="text-[0.78rem] text-[var(--pv-ink-soft)]">{goal.statusPhrase}</div>
        {goal.recentItems.length > 0 ? (
          <div className="mt-0.5 text-[0.78rem] leading-relaxed text-[var(--pv-ink-soft)]">
            Recently: <b className="font-bold text-[var(--pv-ink)]">{goal.recentItems.join(", ")}</b>
          </div>
        ) : null}
        {showEvidence ? (
          <div className="mt-0.5 text-[0.72rem] text-[var(--pv-ink-faint)]">
            {goal.evidenceCount} moment{goal.evidenceCount === 1 ? "" : "s"} ·{" "}
            <b className="font-bold text-[var(--pv-green-600,var(--pv-green-700))]">{formatEnvironments(goal.environments)}</b>
          </div>
        ) : null}
      </div>
      <Glyph levels={goal.glyphLevels} />
      <span className="flex-shrink-0 text-[1.1rem] text-[var(--pv-ink-faint)]">›</span>
    </button>
  );
}

function EnvTag({ centreName }: { centreName: string | null }) {
  const isHome = (centreName ?? "Home") === "Home";
  return (
    <span
      className="flex-shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-bold"
      style={isHome ? { background: "var(--pv-orange-100)", color: "#B5701F" } : { background: "var(--pv-blue-100)", color: "var(--pv-blue-500)" }}
    >
      {centreName ?? "Home"}
    </span>
  );
}

function GoalDetailView({ view, kidName, onBack }: { view: GrowthGoalView; kidName: string; onBack: () => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const itemsWithEvidence = view.goal.items.filter((i) => i.evidence.length > 0);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-1 text-[0.82rem] font-bold text-[var(--pv-green-700)]">
        ← Back
      </button>
      <div className="mb-3.5">
        <div className="text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">{view.domainName}</div>
        <h2 className="mt-0.5 text-[1.15rem] font-extrabold text-[var(--pv-ink)]">{view.goalTitle}</h2>
      </div>

      <div className="mb-3.5 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3.5 shadow-sm">
        <div className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">Skill</div>
        <div className="text-[0.88rem] font-bold leading-relaxed text-[var(--pv-ink)]">{view.skillName}</div>
      </div>

      <div className="mb-2 mt-4 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">
        {kidName} has practiced {itemsWithEvidence.length} thing{itemsWithEvidence.length === 1 ? "" : "s"} for this
      </div>
      {itemsWithEvidence.map((item) => {
        const isOpen = expanded.has(item.id);
        const glyphLevels = item.evidence.slice(0, 5).reverse().map((e) => levelFor(e.outcome));
        return (
          <div key={item.id} className="mb-2 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 shadow-sm">
            <button type="button" onClick={() => toggle(item.id)} className="flex w-full items-center justify-between gap-2.5 py-3.5 text-left">
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex-shrink-0 text-[0.8rem] text-[var(--pv-ink-faint)]">{isOpen ? "▾" : "▸"}</span>
                <span className="truncate text-[0.88rem] font-bold text-[var(--pv-ink)]">{itemLabel(item)}</span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-2.5">
                <Glyph levels={glyphLevels} />
                <span className="text-[0.74rem] font-bold text-[var(--pv-ink-faint)]">{item.evidence.length}×</span>
              </span>
            </button>
            {isOpen ? (
              <div className="border-t border-[var(--pv-border)] py-1.5">
                {item.evidence.map((e) => {
                  const mLabel = modalityLabel(e.modality);
                  const measureLabel = measurementLabel(e);
                  return (
                    <div key={e.id} className="flex items-center gap-2.5 py-2">
                      <div className="w-[72px] flex-shrink-0 text-[0.72rem] font-bold text-[var(--pv-ink-faint)]">{formatDate(e.logDate)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[0.82rem] font-semibold text-[var(--pv-ink)]">{measureLabel ?? outcomeLabel(e.outcome)}</div>
                        {measureLabel ? <div className="text-[0.72rem] text-[var(--pv-ink-faint)]">{outcomeLabel(e.outcome)}</div> : null}
                        {mLabel ? <div className="text-[0.72rem] text-[var(--pv-ink-faint)]">{mLabel}</div> : null}
                      </div>
                      <EnvTag centreName={e.centreName} />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function HybridGrowthView({
  goals,
  moments,
  kidName,
  onSelectGoal
}: {
  goals: GrowthGoalView[];
  moments: GrowthMoment[];
  kidName: string;
  onSelectGoal: (goalId: string) => void;
}) {
  const [detailed, setDetailed] = useState(false);
  const up = goals.filter((g) => g.trend === "up");
  const crossEnv = goals.filter((g) => g.environments.length > 1);
  const topGoal = up[0] ?? goals[0];
  const byDomain = groupByDomain(goals);
  const recentMoments = moments.slice(0, 2);

  return (
    <>
      <div
        className="mb-3.5 rounded-3xl px-5 py-5 text-white shadow-md"
        style={{ background: "linear-gradient(155deg, var(--pv-green-700), var(--pv-green-900))" }}
      >
        <div className="mb-1.5 text-[0.72rem] font-extrabold uppercase tracking-wide opacity-80">Growth highlight</div>
        <p className="m-0 text-[1rem] font-bold leading-snug">
          {topGoal
            ? `${kidName} is ${topGoal.statusPhrase.toLowerCase()} on "${topGoal.goalTitle}" — ${topGoal.evidenceCount} moments logged.`
            : "No practice history logged yet."}
        </p>
      </div>

      <div className="mb-3.5 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-2.5 py-3 text-center">
          <div className="text-[1.3rem] font-extrabold text-[var(--pv-green-700)]">{up.length}</div>
          <div className="mt-0.5 text-[0.66rem] font-bold leading-tight text-[var(--pv-ink-faint)]">Getting stronger</div>
        </div>
        <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-2.5 py-3 text-center">
          <div className="text-[1.3rem] font-extrabold text-[var(--pv-green-700)]">{crossEnv.length}</div>
          <div className="mt-0.5 text-[0.66rem] font-bold leading-tight text-[var(--pv-ink-faint)]">Showing up at home too</div>
        </div>
        <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-2.5 py-3 text-center">
          <div className="text-[1.3rem] font-extrabold text-[var(--pv-green-700)]">{goals.length}</div>
          <div className="mt-0.5 text-[0.66rem] font-bold leading-tight text-[var(--pv-ink-faint)]">Goals with evidence</div>
        </div>
      </div>

      <div className="mb-3.5 flex w-fit rounded-full bg-[var(--pv-border)] p-[3px]">
        <button
          type="button"
          onClick={() => setDetailed(false)}
          className={`rounded-full px-3.5 py-1.5 text-[0.76rem] font-bold ${!detailed ? "bg-[var(--pv-surface)] text-[var(--pv-green-700)] shadow-sm" : "text-[var(--pv-ink-soft)]"}`}
        >
          Simple
        </button>
        <button
          type="button"
          onClick={() => setDetailed(true)}
          className={`rounded-full px-3.5 py-1.5 text-[0.76rem] font-bold ${detailed ? "bg-[var(--pv-surface)] text-[var(--pv-green-700)] shadow-sm" : "text-[var(--pv-ink-soft)]"}`}
        >
          Detailed
        </button>
      </div>
      <GlyphLegend />

      {detailed && crossEnv.length > 0 ? (
        <div className="mb-3.5 flex gap-2.5 rounded-xl border border-[var(--pv-green-100)] bg-[var(--pv-green-100)]/40 px-3.5 py-3">
          <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--pv-green-500)] text-[0.7rem] font-extrabold text-white">
            ✓
          </div>
          <div>
            <div className="text-[0.82rem] font-extrabold text-[var(--pv-green-700)]">Consistent across settings</div>
            <div className="text-[0.76rem] leading-relaxed text-[var(--pv-ink-soft)]">
              {crossEnv.length} goal{crossEnv.length === 1 ? "" : "s"} now show up in more than one setting, not just one place.
            </div>
          </div>
        </div>
      ) : null}

      {byDomain.map(([domainName, domainGoals]) => (
        <div key={domainName}>
          <div className="mb-1.5 mt-4 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">
            {domainName} <span className="font-semibold normal-case tracking-normal opacity-70">({domainGoals.length})</span>
          </div>
          <div className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 shadow-sm">
            {domainGoals.map((g) => (
              <GoalRow key={g.goalId} goal={g} showEvidence={detailed} onSelect={onSelectGoal} />
            ))}
          </div>
        </div>
      ))}

      {recentMoments.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3.5 shadow-sm">
          <div className="mb-2.5">
            <div className="text-[0.88rem] font-extrabold text-[var(--pv-ink)]">{kidName}'s journey</div>
            <div className="text-[0.7rem] text-[var(--pv-ink-faint)]">{moments.length} moments found</div>
          </div>
          {recentMoments.map((m, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 text-[0.78rem] text-[var(--pv-ink-soft)]">
              <span
                className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                style={{ background: m.environment === "Home" ? "var(--pv-orange-500)" : "var(--pv-green-500)" }}
              />
              {m.goalTitle} — {m.title}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function Growth({ token, kidId, kidName, onBack }: { token: string; kidId: string; kidName: string; onBack: () => void }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listGoals(token, kidId)
      .then(setGoals)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load growth. Try again."));
  }, [token, kidId]);

  const goalViews = goals ? buildGrowthGoals(goals) : [];
  const moments = goals ? buildGrowthMoments(goals) : [];
  const selected = goalViews.find((g) => g.goalId === selectedGoalId) ?? null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5">
        <button
          type="button"
          onClick={selected ? () => setSelectedGoalId(null) : onBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">Growth</p>
      </header>

      <main className="mx-auto w-full min-h-0 max-w-2xl flex-1 overflow-y-auto px-5 py-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !goals ? (
          <div className="flex justify-center py-10">
            <img src={mark} alt="" className="h-8 w-8 animate-pulse opacity-60" />
          </div>
        ) : selected ? (
          <GoalDetailView view={selected} kidName={kidName} onBack={() => setSelectedGoalId(null)} />
        ) : goalViews.length === 0 ? (
          <p className="text-sm text-[var(--pv-ink-faint)]">No practice history logged for {kidName} yet.</p>
        ) : (
          <HybridGrowthView goals={goalViews} moments={moments} kidName={kidName} onSelectGoal={setSelectedGoalId} />
        )}
      </main>
    </div>
  );
}
