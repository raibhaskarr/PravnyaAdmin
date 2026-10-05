import { useState } from "react";
import type { Goal, GoalItem, GoalItemEvidenceRow } from "../../api/types";
import { formatDate, itemLabel, measurementLabel } from "./goalEvidence";

// Real-data port of the POC "Growth preview" Hybrid concept (frontend/src/pages/admin/growthPreview.tsx)
// -- same visual language and components, sourced from actual Goal/GoalItem/GoalItemEvidence instead
// of PocGoalTag/PocLogEvidence. The unit here is simpler than the POC version: a real Goal already
// has exactly one skill and its items are already real discrete entities, not text re-grouped by hint.
// Class names are prefixed `gp-` (kept from the POC original) to avoid colliding with the admin
// theme's own global `.card`/`.tag`/`.btn` styles.

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

interface EvidenceWithItem extends GoalItemEvidenceRow {
  itemLabel: string;
  /** Null when this evidence has no specific matched item -- it's the "General practice" bucket,
   * which reads fine as a group header but not inside a "Got X right" sentence. */
  itemName: string | null;
}

function allEvidenceWithItem(goal: Goal): EvidenceWithItem[] {
  return goal.items
    .flatMap((i) => i.evidence.map((e) => ({ ...e, itemLabel: itemLabel(i), itemName: i.customText ?? i.canonicalSkillItem?.displayName ?? null })))
    .sort((a, b) => (a.logDate ?? "").localeCompare(b.logDate ?? ""));
}

interface GrowthGoalView {
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

function buildGrowthGoals(goals: Goal[]): GrowthGoalView[] {
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

interface GrowthMoment {
  date: string;
  goalTitle: string;
  title: string;
  environment: string;
  tag: "First independent" | "New setting";
}

function buildGrowthMoments(goals: Goal[], limit = 10): GrowthMoment[] {
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
        moments.push({ date: e.logDate!, goalTitle: g.title, title, environment: env, tag: "First independent" });
      } else if (isNewEnv && hadSeenAnyEnv) {
        moments.push({ date: e.logDate!, goalTitle: g.title, title: `First time this showed up at ${env}`, environment: env, tag: "New setting" });
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

function Glyph({ levels }: { levels: number[] }) {
  return (
    <div className="gp-glyph-wrap">
      <div className="gp-glyph">
        {levels.map((lvl, i) => (
          <span key={i} className={`gp-glyph-bar gp-lvl${lvl}`} />
        ))}
      </div>
      <div className="gp-glyph-caption">last {levels.length}</div>
    </div>
  );
}

function GlyphLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="gp-legend">
      <button type="button" className="gp-legend-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="gp-legend-icon">i</span> What do the colored bars mean?
      </button>
      {open ? (
        <div className="gp-legend-body">
          Each bar is one of the most recent tries at that goal, oldest on the left. Taller and greener means more
          independent; shorter and lighter means more help was needed.
        </div>
      ) : null}
    </div>
  );
}

function GoalRow({ goal, showEvidence, onSelect }: { goal: GrowthGoalView; showEvidence: boolean; onSelect: (goalId: string) => void }) {
  return (
    <button type="button" className="gp-skill-row" onClick={() => onSelect(goal.goalId)}>
      <div className="gp-skill-txt">
        <div className="gp-skill-name">{goal.goalTitle}</div>
        <div className="gp-skill-status">{goal.statusPhrase}</div>
        {goal.recentItems.length > 0 ? (
          <div className="gp-recent-items">
            Recently: <b>{goal.recentItems.join(", ")}</b>
          </div>
        ) : null}
        {showEvidence ? (
          <div className="gp-evidence-line">
            {goal.evidenceCount} moment{goal.evidenceCount === 1 ? "" : "s"} · <b>{formatEnvironments(goal.environments)}</b>
          </div>
        ) : null}
      </div>
      <Glyph levels={goal.glyphLevels} />
      <span className="gp-skill-chev">›</span>
    </button>
  );
}

function GoalDetailView({ view, kidLabel, onBack }: { view: GrowthGoalView; kidLabel: string; onBack: () => void }) {
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
      <button type="button" className="gp-back-btn" onClick={onBack}>
        ← Back
      </button>
      <div className="gp-detail-head">
        <div className="gp-domain-label">{view.domainName}</div>
        <h2>{view.goalTitle}</h2>
      </div>

      <div className="gp-card gp-goal-card">
        <div className="gp-goal-label">Skill</div>
        <div className="gp-goal-row">
          <div className="gp-goal-title">{view.skillName}</div>
        </div>
      </div>

      <div className="gp-domain-label">
        {kidLabel} has practiced {itemsWithEvidence.length} thing{itemsWithEvidence.length === 1 ? "" : "s"} for this
      </div>
      {itemsWithEvidence.map((item: GoalItem) => {
        const isOpen = expanded.has(item.id);
        const glyphLevels = item.evidence.slice(0, 5).reverse().map((e) => levelFor(e.outcome));
        return (
          <div key={item.id} className="gp-card" style={{ padding: "0.2rem 1.1rem" }}>
            <button type="button" className="gp-item-toggle" onClick={() => toggle(item.id)}>
              <span className="gp-item-toggle-left">
                <span className="gp-item-chev">{isOpen ? "▾" : "▸"}</span>
                <span className="gp-item-name">{itemLabel(item)}</span>
              </span>
              <span className="gp-item-right">
                <Glyph levels={glyphLevels} />
                <span className="gp-item-count">{item.evidence.length}×</span>
              </span>
            </button>
            {isOpen ? (
              <div className="gp-item-history">
                {item.evidence.map((e) => {
                  const mLabel = modalityLabel(e.modality);
                  const measureLabel = measurementLabel(e);
                  return (
                    <div key={e.id} className="gp-history-row">
                      <div className="gp-history-date">{formatDate(e.logDate)}</div>
                      <div className="gp-history-mid">
                        <div className="gp-history-outcome">{measureLabel ?? outcomeLabel(e.outcome)}</div>
                        {measureLabel ? <div className="gp-history-modality">{outcomeLabel(e.outcome)}</div> : null}
                        {mLabel ? <div className="gp-history-modality">{mLabel}</div> : null}
                      </div>
                      <span className={`gp-tag ${(e.centreName ?? "Home") === "Home" ? "gp-tag-home" : "gp-tag-clinic"}`}>{e.centreName ?? "Home"}</span>
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

function HybridGrowthView({ goals, moments, kidLabel, onSelectGoal }: { goals: GrowthGoalView[]; moments: GrowthMoment[]; kidLabel: string; onSelectGoal: (goalId: string) => void }) {
  const [detailed, setDetailed] = useState(false);
  const up = goals.filter((g) => g.trend === "up");
  const crossEnv = goals.filter((g) => g.environments.length > 1);
  const topGoal = up[0] ?? goals[0];
  const byDomain = groupByDomain(goals);
  const recentMoments = moments.slice(0, 2);

  return (
    <>
      <div className="gp-hero">
        <div className="gp-hero-eyebrow">Growth highlight</div>
        <p>
          {topGoal
            ? `${kidLabel} is ${topGoal.statusPhrase.toLowerCase()} on "${topGoal.goalTitle}" — ${topGoal.evidenceCount} moments logged.`
            : "No practice history logged yet."}
        </p>
      </div>
      <div className="gp-stat-row">
        <div className="gp-stat-tile">
          <div className="gp-stat-num">{up.length}</div>
          <div className="gp-stat-lbl">Getting stronger</div>
        </div>
        <div className="gp-stat-tile">
          <div className="gp-stat-num">{crossEnv.length}</div>
          <div className="gp-stat-lbl">Showing up at home too</div>
        </div>
        <div className="gp-stat-tile">
          <div className="gp-stat-num">{goals.length}</div>
          <div className="gp-stat-lbl">Goals with evidence</div>
        </div>
      </div>

      <div className="gp-detail-toggle">
        <button type="button" className={!detailed ? "gp-active" : ""} onClick={() => setDetailed(false)}>
          Simple
        </button>
        <button type="button" className={detailed ? "gp-active" : ""} onClick={() => setDetailed(true)}>
          Detailed
        </button>
      </div>
      <GlyphLegend />

      {detailed && crossEnv.length > 0 ? (
        <div className="gp-trust-strip">
          <div className="gp-trust-icon">✓</div>
          <div>
            <div className="gp-trust-title">Consistent across settings</div>
            <div className="gp-trust-sub">
              {crossEnv.length} goal{crossEnv.length === 1 ? "" : "s"} now show up in more than one setting, not just one place.
            </div>
          </div>
        </div>
      ) : null}

      {byDomain.map(([domainName, domainGoals]) => (
        <div key={domainName}>
          <div className="gp-domain-label">
            {domainName} <span className="gp-domain-count">({domainGoals.length})</span>
          </div>
          <div className="gp-card gp-rows-card">
            {domainGoals.map((g) => (
              <GoalRow key={g.goalId} goal={g} showEvidence={detailed} onSelect={onSelectGoal} />
            ))}
          </div>
        </div>
      ))}

      {recentMoments.length > 0 ? (
        <div className="gp-card gp-teaser-card">
          <div className="gp-teaser-head">
            <div>
              <div className="gp-teaser-title">{kidLabel}'s journey</div>
              <div className="gp-teaser-sub">{moments.length} moments found</div>
            </div>
          </div>
          {recentMoments.map((m, i) => (
            <div key={i} className="gp-teaser-row">
              <span className={`gp-teaser-dot ${m.environment === "Home" ? "gp-home" : ""}`} />
              {m.goalTitle} — {m.title}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function RealGrowthView({ kidLabel, goals }: { kidLabel: string; goals: Goal[] }) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const goalViews = buildGrowthGoals(goals);
  const moments = buildGrowthMoments(goals);
  const selected = goalViews.find((g) => g.goalId === selectedGoalId) ?? null;

  return (
    <div className="gp-root">
      <style>{REAL_GROWTH_CSS}</style>
      <div className="gp-screen">
        {selected ? (
          <GoalDetailView view={selected} kidLabel={kidLabel} onBack={() => setSelectedGoalId(null)} />
        ) : (
          <>
            <div className="gp-app-topbar">
              <div className="gp-avatar">{kidLabel.charAt(0)}</div>
              <div>
                <div className="gp-child-name">{kidLabel}'s Growth</div>
                <div className="gp-child-sub">
                  {goalViews.length} goal{goalViews.length === 1 ? "" : "s"} with evidence
                </div>
              </div>
            </div>
            {goalViews.length === 0 ? (
              <p className="gp-empty">No practice history logged for this kid yet.</p>
            ) : (
              <HybridGrowthView goals={goalViews} moments={moments} kidLabel={kidLabel} onSelectGoal={setSelectedGoalId} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

const REAL_GROWTH_CSS = `
.gp-root { --gpf: -apple-system, "Segoe UI Variable", "Segoe UI", ui-rounded, "Plus Jakarta Sans", sans-serif;
  --gp-bg: #F4F7F4; --gp-panel: #FFFFFF; --gp-ink: #1C2B22; --gp-ink-soft: #5B6B61; --gp-ink-faint: #8B998F;
  --gp-border: #E3EBE4; --gp-green-700: #1F5A42; --gp-green-600: #256B4E; --gp-green-500: #2E7D5B;
  --gp-green-100: #DCEEE4; --gp-green-50: #EFF7F2; --gp-orange-500: #F39C4A; --gp-orange-100: #FDE9D3;
  --gp-blue-500: #4A8FF3; --gp-blue-100: #DCE9FD; --gp-shadow-sm: 0 1px 2px rgba(28,43,34,0.06);
  --gp-shadow-md: 0 6px 20px rgba(28,43,34,0.08); --gp-radius-s: 10px; --gp-radius-m: 16px; --gp-radius-l: 22px; }
.gp-screen { max-width: 480px; background: var(--gp-bg); border-radius: var(--gp-radius-l); border: 1px solid var(--gp-border);
  padding: 1rem 1.1rem 1.5rem; font-family: var(--gpf); color: var(--gp-ink); box-shadow: var(--gp-shadow-sm); }
.gp-app-topbar { display: flex; align-items: center; gap: 0.55rem; padding: 0.3rem 0 0.9rem; }
.gp-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--gp-green-100); color: var(--gp-green-700); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; flex-shrink: 0; }
.gp-child-name { font-weight: 800; font-size: 0.95rem; }
.gp-child-sub { font-size: 0.72rem; color: var(--gp-ink-faint); }
.gp-card { background: var(--gp-panel); border-radius: var(--gp-radius-m); border: 1px solid var(--gp-border); box-shadow: var(--gp-shadow-sm); padding: 1.1rem; margin-bottom: 0.9rem; }
.gp-rows-card { padding: 0.2rem 1.1rem; }
.gp-hero { background: linear-gradient(155deg, var(--gp-green-600), var(--gp-green-700)); color: white; border-radius: var(--gp-radius-l); padding: 1.2rem 1.25rem 1.3rem; margin-bottom: 0.9rem; box-shadow: var(--gp-shadow-md); }
.gp-hero-eyebrow { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; opacity: 0.8; margin-bottom: 0.45rem; }
.gp-hero p { margin: 0; font-size: 1rem; font-weight: 700; line-height: 1.42; }
.gp-stat-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.55rem; margin-bottom: 0.9rem; }
.gp-stat-tile { background: var(--gp-panel); border: 1px solid var(--gp-border); border-radius: var(--gp-radius-s); padding: 0.7rem 0.6rem; text-align: center; }
.gp-stat-num { font-size: 1.3rem; font-weight: 800; color: var(--gp-green-700); }
.gp-stat-lbl { font-size: 0.66rem; color: var(--gp-ink-faint); font-weight: 700; margin-top: 0.15rem; line-height: 1.3; }
.gp-domain-label { font-size: 0.78rem; font-weight: 800; color: var(--gp-ink-faint); text-transform: uppercase; letter-spacing: 0.05em; margin: 1.1rem 0 0.5rem 0.1rem; }
.gp-domain-count { font-weight: 700; text-transform: none; letter-spacing: 0; opacity: 0.7; }
.gp-detail-toggle { display: flex; background: var(--gp-border); border-radius: 999px; padding: 3px; margin-bottom: 0.9rem; width: fit-content; }
.gp-detail-toggle button { font-family: var(--gpf); border: none; background: none; color: var(--gp-ink-soft); font-size: 0.76rem; font-weight: 700; padding: 0.4rem 0.9rem; border-radius: 999px; cursor: pointer; }
.gp-detail-toggle button.gp-active { background: var(--gp-panel); color: var(--gp-green-700); box-shadow: var(--gp-shadow-sm); }
.gp-legend { margin-bottom: 0.9rem; }
.gp-legend-trigger { font-family: var(--gpf); display: inline-flex; align-items: center; gap: 0.4rem; border: none; background: none; color: var(--gp-green-600); font-size: 0.76rem; font-weight: 700; padding: 0; cursor: pointer; }
.gp-legend-icon { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--gp-green-600); font-size: 0.64rem; font-weight: 800; font-style: italic; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.gp-legend-body { margin-top: 0.5rem; background: var(--gp-green-50); border: 1px solid var(--gp-green-100); border-radius: var(--gp-radius-s); padding: 0.7rem 0.85rem; font-size: 0.78rem; color: var(--gp-ink-soft); line-height: 1.5; }
.gp-skill-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.8rem 0.2rem; border-bottom: 1px solid var(--gp-border); width: 100%; font-family: var(--gpf); background: none; border-left: none; border-right: none; border-top: none; text-align: left; cursor: pointer; }
.gp-skill-chev { color: var(--gp-ink-faint); font-size: 1.1rem; flex-shrink: 0; }
.gp-back-btn { font-family: var(--gpf); border: none; background: none; color: var(--gp-green-600); font-size: 0.82rem; font-weight: 700; padding: 0.5rem 0.1rem; margin-bottom: 0.3rem; cursor: pointer; }
.gp-detail-head { margin-bottom: 0.9rem; }
.gp-detail-head h2 { font-size: 1.15rem; font-weight: 800; margin: 0.15rem 0 0; }
.gp-goal-card { padding: 0.9rem 1rem; }
.gp-goal-label { font-size: 0.7rem; font-weight: 800; color: var(--gp-ink-faint); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
.gp-goal-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.35rem 0; }
.gp-goal-title { font-size: 0.88rem; font-weight: 700; line-height: 1.4; }
.gp-item-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; font-family: var(--gpf); background: none; border: none; padding: 0.85rem 0.1rem; cursor: pointer; text-align: left; }
.gp-item-toggle-left { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
.gp-item-chev { color: var(--gp-ink-faint); font-size: 0.8rem; flex-shrink: 0; }
.gp-item-name { font-weight: 700; font-size: 0.88rem; }
.gp-item-right { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
.gp-item-count { font-size: 0.74rem; font-weight: 700; color: var(--gp-ink-faint); }
.gp-item-history { border-top: 1px solid var(--gp-border); padding: 0.3rem 0 0.7rem; }
.gp-history-row { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0.1rem; }
.gp-history-date { font-size: 0.72rem; font-weight: 700; color: var(--gp-ink-faint); width: 72px; flex-shrink: 0; }
.gp-history-mid { flex: 1; min-width: 0; }
.gp-history-outcome { font-size: 0.82rem; font-weight: 600; color: var(--gp-ink); }
.gp-history-modality { font-size: 0.72rem; color: var(--gp-ink-faint); margin-top: 0.1rem; }
.gp-skill-row:last-child { border-bottom: none; }
.gp-skill-txt { flex: 1; min-width: 0; }
.gp-skill-name { font-weight: 700; font-size: 0.9rem; margin-bottom: 0.2rem; }
.gp-skill-status { font-size: 0.78rem; color: var(--gp-ink-soft); }
.gp-evidence-line { font-size: 0.72rem; color: var(--gp-ink-faint); margin-top: 0.2rem; }
.gp-evidence-line b { color: var(--gp-green-600); font-weight: 700; }
.gp-glyph-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; flex-shrink: 0; }
.gp-glyph { display: flex; gap: 3px; align-items: flex-end; height: 20px; }
.gp-glyph-caption { font-size: 0.58rem; color: var(--gp-ink-faint); font-weight: 700; white-space: nowrap; }
.gp-recent-items { font-size: 0.78rem; color: var(--gp-ink-soft); margin-top: 0.2rem; line-height: 1.4; }
.gp-recent-items b { color: var(--gp-ink); font-weight: 700; }
.gp-glyph-bar { width: 6px; border-radius: 3px; }
.gp-lvl1 { height: 30%; background: var(--gp-border); }
.gp-lvl2 { height: 55%; background: var(--gp-orange-100); }
.gp-lvl3 { height: 75%; background: var(--gp-orange-500); }
.gp-lvl4 { height: 100%; background: var(--gp-green-500); }
.gp-empty { font-size: 0.85rem; color: var(--gp-ink-faint); padding: 1rem 0.2rem; }
.gp-tag { font-size: 0.66rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 999px; }
.gp-tag-clinic { background: var(--gp-blue-100); color: var(--gp-blue-500); }
.gp-tag-home { background: var(--gp-orange-100); color: #B5701F; }
.gp-trust-strip { display: flex; gap: 0.7rem; align-items: flex-start; background: var(--gp-green-50); border: 1px solid var(--gp-green-100); border-radius: var(--gp-radius-s); padding: 0.75rem 0.85rem; margin-bottom: 0.9rem; }
.gp-trust-icon { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; background: var(--gp-green-500); color: white; font-size: 0.7rem; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.gp-trust-title { font-weight: 800; font-size: 0.82rem; color: var(--gp-green-700); margin-bottom: 0.1rem; }
.gp-trust-sub { font-size: 0.76rem; color: var(--gp-ink-soft); line-height: 1.4; }
.gp-teaser-card { padding: 1rem 1.1rem; }
.gp-teaser-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.7rem; }
.gp-teaser-title { font-weight: 800; font-size: 0.88rem; }
.gp-teaser-sub { font-size: 0.7rem; color: var(--gp-ink-faint); margin-top: 0.1rem; }
.gp-teaser-row { font-size: 0.78rem; color: var(--gp-ink-soft); display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0; }
.gp-teaser-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--gp-green-500); flex-shrink: 0; }
.gp-teaser-dot.gp-home { background: var(--gp-orange-500); }
`;
