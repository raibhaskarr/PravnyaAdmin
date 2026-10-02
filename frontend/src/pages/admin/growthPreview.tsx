import { useState } from "react";
import type { PocGoalTag, PocLogEvidenceRow } from "../../api/types";

// Preview-only: renders what the real parent-facing Growth page could look like, computed from
// real tagged POC data (Pranava/Ananya), using the real app's consumer palette (not PravnyaAdmin's
// own admin theme) since the point is to preview that other surface, not this one. All class names
// are prefixed `gp-` to avoid colliding with PravnyaAdmin's own global `.card`/`.tag`/`.btn` styles.

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

/** Returns null for UNKNOWN/NOT_APPLICABLE -- nothing worth showing a parent in those cases. */
function modalityLabel(modality: string): string | null {
  return MODALITY_LABEL[modality] ?? null;
}

function formatDate(date: string | null): string {
  if (!date) return "Undated";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface GrowthSkillView {
  skillId: string;
  skillName: string;
  domainName: string;
  goalCount: number;
  evidenceCount: number;
  environments: string[];
  glyphLevels: number[];
  statusPhrase: string;
  trend: "up" | "steady" | "emerging";
  recentItems: string[];
}

/** The actual words/actions a parent would recognize -- "Apple", "Ball", "roti" -- not the
 * clinical skill name. Prefers the real taxonomy item when one matched; falls back to the raw
 * extracted item hint (still AI-derived structured text, never a log excerpt) when it didn't. */
function recentItemNames(evidence: PocLogEvidenceRow[], limit = 4): string[] {
  const sorted = [...evidence].sort((a, b) => (b.logDate ?? "").localeCompare(a.logDate ?? ""));
  const seen = new Set<string>();
  const names: string[] = [];
  for (const e of sorted) {
    const name = e.itemMatchMethod === "ai" && e.predictedItem ? e.predictedItem.displayName : e.itemHint?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}

function buildGrowthSkills(goalTags: PocGoalTag[], logEvidence: PocLogEvidenceRow[]): GrowthSkillView[] {
  const map = new Map<string, { skillName: string; domainName: string; goals: PocGoalTag[]; evidence: PocLogEvidenceRow[] }>();
  function forSkill(skill: { id: string; name: string; domain: { name: string } }) {
    let entry = map.get(skill.id);
    if (!entry) {
      entry = { skillName: skill.name, domainName: skill.domain.name, goals: [], evidence: [] };
      map.set(skill.id, entry);
    }
    return entry;
  }
  for (const g of goalTags) if (g.predictedSkill) forSkill(g.predictedSkill).goals.push(g);
  for (const e of logEvidence) if (e.predictedSkill) forSkill(e.predictedSkill).evidence.push(e);

  const views: GrowthSkillView[] = [];
  for (const [skillId, entry] of map) {
    if (entry.evidence.length === 0) continue;
    const sorted = [...entry.evidence].sort((a, b) => (a.logDate ?? "").localeCompare(b.logDate ?? ""));
    const glyphLevels = sorted.slice(-5).map((e) => levelFor(e.outcome));
    const environments = [...new Set(sorted.map((e) => environmentLabel(e.centreName)))];

    const half = Math.max(1, Math.floor(sorted.length / 2));
    const earlyAvg = average(sorted.slice(0, half).map((e) => levelFor(e.outcome)));
    const recentAvg = average(sorted.slice(-half).map((e) => levelFor(e.outcome)));

    let trend: GrowthSkillView["trend"];
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
      skillId,
      skillName: entry.skillName,
      domainName: entry.domainName,
      goalCount: entry.goals.length,
      evidenceCount: sorted.length,
      environments,
      glyphLevels,
      statusPhrase,
      trend,
      recentItems: recentItemNames(sorted)
    });
  }
  return views.sort((a, b) => b.evidenceCount - a.evidenceCount);
}

interface GrowthMoment {
  date: string;
  skillName: string;
  title: string;
  environment: string;
  tag: "First independent" | "New setting";
}

/** Walks each skill's evidence in date order looking for two kinds of "firsts": the first CORRECT
 * outcome, and the first time evidence shows up in an environment not seen before for that skill. */
function buildGrowthMoments(logEvidence: PocLogEvidenceRow[], limit = 10): GrowthMoment[] {
  const bySkill = new Map<string, PocLogEvidenceRow[]>();
  for (const e of logEvidence) {
    if (!e.predictedSkill || !e.logDate) continue;
    const arr = bySkill.get(e.predictedSkill.id) ?? [];
    arr.push(e);
    bySkill.set(e.predictedSkill.id, arr);
  }

  const moments: GrowthMoment[] = [];
  for (const rows of bySkill.values()) {
    const sorted = [...rows].sort((a, b) => (a.logDate ?? "").localeCompare(b.logDate ?? ""));
    const skillName = sorted[0].predictedSkill!.name;
    const seenEnv = new Set<string>();
    let firstCorrectFound = false;
    for (const e of sorted) {
      const env = environmentLabel(e.centreName);
      const isNewEnv = !seenEnv.has(env);
      const hadSeenAnyEnv = seenEnv.size > 0;
      seenEnv.add(env);
      if (e.outcome === "CORRECT" && !firstCorrectFound) {
        firstCorrectFound = true;
        moments.push({
          date: e.logDate!,
          skillName,
          title: e.predictedItem ? `Got "${e.predictedItem.displayName}" right for the first time` : `First independent success`,
          environment: env,
          tag: "First independent"
        });
      } else if (isNewEnv && hadSeenAnyEnv) {
        moments.push({
          date: e.logDate!,
          skillName,
          title: `First time this showed up at ${env}`,
          environment: env,
          tag: "New setting"
        });
      }
    }
  }
  return moments.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

interface DomainSummary {
  domainName: string;
  skills: GrowthSkillView[];
  bandPct: number;
  bandLabel: string;
}

function buildDomainSummaries(skills: GrowthSkillView[], maxDomains = 25): DomainSummary[] {
  const byDomain = new Map<string, GrowthSkillView[]>();
  for (const s of skills) {
    const arr = byDomain.get(s.domainName) ?? [];
    arr.push(s);
    byDomain.set(s.domainName, arr);
  }
  const summaries: DomainSummary[] = [...byDomain.entries()]
    .map(([domainName, domainSkills]) => {
      const avgLevel = average(domainSkills.flatMap((s) => s.glyphLevels));
      const bandPct = Math.min(96, Math.max(4, ((avgLevel - 1) / 3) * 100));
      const bandLabel = bandPct >= 70 ? "Practicing independently more often" : bandPct >= 40 ? "Building consistency" : "Early stages — needs support";
      return { domainName, skills: domainSkills.sort((a, b) => b.evidenceCount - a.evidenceCount), bandPct, bandLabel };
    })
    .sort((a, b) => b.skills.reduce((n, s) => n + s.evidenceCount, 0) - a.skills.reduce((n, s) => n + s.evidenceCount, 0));
  return summaries.slice(0, maxDomains);
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

/** Tap-to-expand, not hover-only -- a native `title` tooltip never fires on a touch screen, and
 * this preview is standing in for a touch-first mobile app, not this admin tool's own desktop UI. */
function GlyphLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="gp-legend">
      <button type="button" className="gp-legend-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="gp-legend-icon">i</span> What do the colored bars mean?
      </button>
      {open ? (
        <div className="gp-legend-body">
          Each bar is one of the most recent tries at that skill, oldest on the left. Taller and greener means more
          independent; shorter and lighter means more help was needed.
        </div>
      ) : null}
    </div>
  );
}

function SkillRow({ skill, showEvidence, onSelect }: { skill: GrowthSkillView; showEvidence: boolean; onSelect?: (skillId: string) => void }) {
  return (
    <button type="button" className="gp-skill-row" onClick={onSelect ? () => onSelect(skill.skillId) : undefined}>
      <div className="gp-skill-txt">
        <div className="gp-skill-name">{skill.skillName}</div>
        <div className="gp-skill-status">{skill.statusPhrase}</div>
        {skill.recentItems.length > 0 ? (
          <div className="gp-recent-items">
            Recently: <b>{skill.recentItems.join(", ")}</b>
          </div>
        ) : null}
        {showEvidence ? (
          <div className="gp-evidence-line">
            {skill.evidenceCount} moment{skill.evidenceCount === 1 ? "" : "s"} · <b>{formatEnvironments(skill.environments)}</b>
          </div>
        ) : null}
      </div>
      <Glyph levels={skill.glyphLevels} />
      {onSelect ? <span className="gp-skill-chev">›</span> : null}
    </button>
  );
}

interface ItemHistoryGroup {
  key: string;
  label: string;
  evidence: PocLogEvidenceRow[];
  glyphLevels: number[];
}

/** Same grouping idea as the admin POC review page's by-item view (group evidence by the real
 * matched item, falling back to the raw hint, falling back to a catch-all bucket) -- re-used here
 * because it's already the right shape for "what did my kid actually practice", just relabeled. */
function groupEvidenceByItemForDetail(evidence: PocLogEvidenceRow[]): ItemHistoryGroup[] {
  const map = new Map<string, { label: string; rows: PocLogEvidenceRow[] }>();
  for (const e of evidence) {
    const name = e.itemMatchMethod === "ai" && e.predictedItem ? e.predictedItem.displayName : e.itemHint?.trim();
    const key = name ? name.toLowerCase() : "general-practice";
    const label = name ?? "General practice (no specific item)";
    let group = map.get(key);
    if (!group) {
      group = { label, rows: [] };
      map.set(key, group);
    }
    group.rows.push(e);
  }
  return [...map.entries()]
    .map(([key, { label, rows }]) => {
      const sorted = [...rows].sort((a, b) => (b.logDate ?? "").localeCompare(a.logDate ?? ""));
      return { key, label, evidence: sorted, glyphLevels: [...sorted].reverse().slice(-5).map((e) => levelFor(e.outcome)) };
    })
    .sort((a, b) => b.evidence.length - a.evidence.length);
}

function SkillDetailView({
  skillId,
  skillName,
  domainName,
  childLabel,
  goalTags,
  logEvidence,
  onBack
}: {
  skillId: string;
  skillName: string;
  domainName: string;
  childLabel: string;
  goalTags: PocGoalTag[];
  logEvidence: PocLogEvidenceRow[];
  onBack: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const goals = goalTags.filter((g) => g.predictedSkill?.id === skillId);
  const evidence = logEvidence.filter((e) => e.predictedSkill?.id === skillId);
  const itemGroups = groupEvidenceByItemForDetail(evidence);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <button type="button" className="gp-back-btn" onClick={onBack}>
        ← Back
      </button>
      <div className="gp-detail-head">
        <div className="gp-domain-label">{domainName}</div>
        <h2>{skillName}</h2>
      </div>

      {goals.length > 0 ? (
        <div className="gp-card gp-goal-card">
          <div className="gp-goal-label">{goals.length > 1 ? "Goals this connects to" : "The goal this connects to"}</div>
          {goals.map((g) => (
            <div key={g.id} className="gp-goal-row">
              <div className="gp-goal-title">{g.goalTitle}</div>
              {g.centreName ? <span className="gp-tag gp-tag-clinic">{g.centreName}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="gp-empty">No specific goal is linked to this skill yet -- only daily logs reference it.</p>
      )}

      <div className="gp-domain-label">
        {childLabel} has practiced {itemGroups.length} thing{itemGroups.length === 1 ? "" : "s"} for this
      </div>
      {itemGroups.map((group) => {
        const isOpen = expanded.has(group.key);
        return (
          <div key={group.key} className="gp-card" style={{ padding: "0.2rem 1.1rem" }}>
            <button type="button" className="gp-item-toggle" onClick={() => toggle(group.key)}>
              <span className="gp-item-toggle-left">
                <span className="gp-item-chev">{isOpen ? "▾" : "▸"}</span>
                <span className="gp-item-name">{group.label}</span>
              </span>
              <span className="gp-item-right">
                <Glyph levels={group.glyphLevels} />
                <span className="gp-item-count">{group.evidence.length}×</span>
              </span>
            </button>
            {isOpen ? (
              <div className="gp-item-history">
                {group.evidence.map((e) => {
                  const mLabel = modalityLabel(e.modality);
                  return (
                    <div key={e.id} className="gp-history-row">
                      <div className="gp-history-date">{formatDate(e.logDate)}</div>
                      <div className="gp-history-mid">
                        <div className="gp-history-outcome">{outcomeLabel(e.outcome)}</div>
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

function NarrativeConcept({ skills, childLabel, onSelectSkill }: { skills: GrowthSkillView[]; childLabel: string; onSelectSkill: (skillId: string) => void }) {
  const up = skills.filter((s) => s.trend === "up");
  const crossEnv = skills.filter((s) => s.environments.length > 1);
  const topSkill = up[0] ?? skills[0];
  const byDomain = groupByDomain(skills);

  return (
    <>
      <div className="gp-hero">
        <div className="gp-hero-eyebrow">Pravnya noticed</div>
        <p>
          {topSkill
            ? `${childLabel} is ${topSkill.statusPhrase.toLowerCase()} on "${topSkill.skillName}" — ${topSkill.evidenceCount} moments logged.`
            : "No evidence logged yet for this pass."}
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
          <div className="gp-stat-num">{skills.length}</div>
          <div className="gp-stat-lbl">Skills with evidence</div>
        </div>
      </div>
      <GlyphLegend />
      {byDomain.map(([domainName, domainSkills]) => (
        <div key={domainName}>
          <div className="gp-domain-label">
            {domainName} <span className="gp-domain-count">({domainSkills.length})</span>
          </div>
          <div className="gp-card gp-rows-card">
            {domainSkills.map((s) => (
              <SkillRow key={s.skillId} skill={s} showEvidence={false} onSelect={onSelectSkill} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function TimelineConcept({ moments, childLabel }: { moments: GrowthMoment[]; childLabel: string }) {
  return (
    <>
      <div className="gp-tl-head">
        <h2>{childLabel}'s journey</h2>
        <p>The moments that mattered, computed from real logged evidence.</p>
      </div>
      {moments.length === 0 ? <p className="gp-empty">No dated evidence to build a journey from yet.</p> : null}
      <div className="gp-tl">
        {moments.map((m, i) => (
          <div key={i} className={`gp-tl-item ${m.environment === "Home" ? "gp-home" : "gp-clinic"}`}>
            <div className="gp-tl-dot" />
            <div className="gp-tl-date">{new Date(m.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
            <div className="gp-tl-card">
              <div className="gp-tl-title">
                {m.skillName} — {m.title}
              </div>
              <div className="gp-tl-tags">
                <span className={`gp-tag ${m.environment === "Home" ? "gp-tag-home" : "gp-tag-clinic"}`}>{m.environment === "Home" ? "At home" : `At ${m.environment}`}</span>
                <span className="gp-tag gp-tag-first">{m.tag}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function groupByDomain(skills: GrowthSkillView[]): [string, GrowthSkillView[]][] {
  const map = new Map<string, GrowthSkillView[]>();
  for (const s of skills) {
    const arr = map.get(s.domainName) ?? [];
    arr.push(s);
    map.set(s.domainName, arr);
  }
  return [...map.entries()].sort((a, b) => b[1].reduce((n, s) => n + s.evidenceCount, 0) - a[1].reduce((n, s) => n + s.evidenceCount, 0));
}

function DashboardConcept({ skills, onSelectSkill }: { skills: GrowthSkillView[]; onSelectSkill: (skillId: string) => void }) {
  const domains = buildDomainSummaries(skills);
  const [activeIdx, setActiveIdx] = useState(0);
  const active = domains[activeIdx];

  if (!active) return <p className="gp-empty">No domains with evidence yet.</p>;

  return (
    <>
      <div className="gp-dom-tabs">
        {domains.map((d, i) => (
          <span key={d.domainName} className={i === activeIdx ? "gp-active" : ""} onClick={() => setActiveIdx(i)}>
            {d.domainName}
          </span>
        ))}
      </div>
      <div className="gp-card gp-level-card">
        <div className="gp-dom-name">{active.domainName}</div>
        <div className="gp-dom-line">{active.bandLabel}</div>
        <div className="gp-band">
          <div className="gp-band-marker" style={{ left: `${active.bandPct}%` }} />
        </div>
        <div className="gp-band-labels">
          <span>Needs support</span>
          <span>Practicing</span>
          <span>Independent</span>
        </div>
      </div>
      <div className="gp-card gp-rows-card">
        {active.skills.map((s) => (
          <button key={s.skillId} type="button" className="gp-dash-skill" onClick={() => onSelectSkill(s.skillId)}>
            <div className="gp-dash-row1">
              <span className="gp-dash-name">{s.skillName}</span>
              <span className={`gp-trend-chip gp-trend-${s.trend}`}>{s.trend === "up" ? "↗ improving" : s.trend === "emerging" ? "● emerging" : "steady"}</span>
            </div>
            <div className="gp-mini-band">
              <i style={{ width: `${Math.min(100, (average(s.glyphLevels) / 4) * 100)}%` }} />
            </div>
            {s.recentItems.length > 0 ? (
              <div className="gp-recent-items">
                Recently: <b>{s.recentItems.join(", ")}</b>
              </div>
            ) : null}
            <div className="gp-evidence-line">
              {s.evidenceCount} moment{s.evidenceCount === 1 ? "" : "s"} · <b>{formatEnvironments(s.environments)}</b>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function HybridConcept({
  skills,
  moments,
  childLabel,
  onSelectSkill
}: {
  skills: GrowthSkillView[];
  moments: GrowthMoment[];
  childLabel: string;
  onSelectSkill: (skillId: string) => void;
}) {
  const [detailed, setDetailed] = useState(false);
  const up = skills.filter((s) => s.trend === "up");
  const crossEnv = skills.filter((s) => s.environments.length > 1);
  const topSkill = up[0] ?? skills[0];
  const byDomain = groupByDomain(skills);
  const recentMoments = moments.slice(0, 2);

  return (
    <>
      <div className="gp-hero">
        <div className="gp-hero-eyebrow">Pravnya noticed</div>
        <p>
          {topSkill
            ? `${childLabel} is ${topSkill.statusPhrase.toLowerCase()} on "${topSkill.skillName}" — ${topSkill.evidenceCount} moments logged.`
            : "No evidence logged yet for this pass."}
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
          <div className="gp-stat-num">{skills.length}</div>
          <div className="gp-stat-lbl">Skills with evidence</div>
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
              {crossEnv.length} skill{crossEnv.length === 1 ? "" : "s"} now show up in more than one setting, not just one place.
            </div>
          </div>
        </div>
      ) : null}

      {byDomain.map(([domainName, domainSkills]) => (
        <div key={domainName}>
          <div className="gp-domain-label">
            {domainName} <span className="gp-domain-count">({domainSkills.length})</span>
          </div>
          <div className="gp-card gp-rows-card">
            {domainSkills.map((s) => (
              <SkillRow key={s.skillId} skill={s} showEvidence={detailed} onSelect={onSelectSkill} />
            ))}
          </div>
        </div>
      ))}

      {recentMoments.length > 0 ? (
        <div className="gp-card gp-teaser-card">
          <div className="gp-teaser-head">
            <div>
              <div className="gp-teaser-title">{childLabel}'s journey</div>
              <div className="gp-teaser-sub">{moments.length} moments found</div>
            </div>
            <div className="gp-teaser-link">See all →</div>
          </div>
          {recentMoments.map((m, i) => (
            <div key={i} className="gp-teaser-row">
              <span className={`gp-teaser-dot ${m.environment === "Home" ? "gp-home" : ""}`} />
              {m.skillName} — {m.title}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

const CONCEPTS = [
  { id: "narrative", label: "1 · Narrative" },
  { id: "timeline", label: "2 · Timeline" },
  { id: "dashboard", label: "3 · Dashboard" },
  { id: "hybrid", label: "5 · Hybrid" }
] as const;
type ConceptId = (typeof CONCEPTS)[number]["id"];

export function GrowthPreviewView({ childLabel, goalTags, logEvidence }: { childLabel: string; goalTags: PocGoalTag[]; logEvidence: PocLogEvidenceRow[] }) {
  const [concept, setConcept] = useState<ConceptId>("hybrid");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const skills = buildGrowthSkills(goalTags, logEvidence);
  const moments = buildGrowthMoments(logEvidence);
  const selectedSkill = skills.find((s) => s.skillId === selectedSkillId) ?? null;

  return (
    <div className="gp-root">
      <style>{GROWTH_PREVIEW_CSS}</style>
      <p className="hint-text" style={{ marginBottom: "0.75rem" }}>
        Preview of the real parent-facing Growth page concepts, computed live from this child's tagged POC
        data (not sample data). Internal review only — this view isn't part of the parent app. Tap any skill
        row to see the goal and item-level history behind it.
      </p>
      <div className="gp-switcher">
        {CONCEPTS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`btn ${concept === c.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setConcept(c.id);
              setSelectedSkillId(null);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="gp-phone">
        <div className="gp-phone-screen">
          <div className="gp-notch">
            <span />
          </div>
          <div className="gp-screen-inner">
            {selectedSkill ? (
              <SkillDetailView
                skillId={selectedSkill.skillId}
                skillName={selectedSkill.skillName}
                domainName={selectedSkill.domainName}
                childLabel={childLabel}
                goalTags={goalTags}
                logEvidence={logEvidence}
                onBack={() => setSelectedSkillId(null)}
              />
            ) : (
              <>
                <div className="gp-app-topbar">
                  <div className="gp-avatar">{childLabel.charAt(0)}</div>
                  <div>
                    <div className="gp-child-name">{childLabel}'s Growth</div>
                    <div className="gp-child-sub">
                      {skills.length} skill{skills.length === 1 ? "" : "s"} with evidence
                    </div>
                  </div>
                </div>
                {concept === "narrative" ? <NarrativeConcept skills={skills} childLabel={childLabel} onSelectSkill={setSelectedSkillId} /> : null}
                {concept === "timeline" ? <TimelineConcept moments={moments} childLabel={childLabel} /> : null}
                {concept === "dashboard" ? <DashboardConcept skills={skills} onSelectSkill={setSelectedSkillId} /> : null}
                {concept === "hybrid" ? (
                  <HybridConcept skills={skills} moments={moments} childLabel={childLabel} onSelectSkill={setSelectedSkillId} />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const GROWTH_PREVIEW_CSS = `
.gp-root { --gpf: -apple-system, "Segoe UI Variable", "Segoe UI", ui-rounded, "Plus Jakarta Sans", sans-serif;
  --gp-bg: #F4F7F4; --gp-panel: #FFFFFF; --gp-ink: #1C2B22; --gp-ink-soft: #5B6B61; --gp-ink-faint: #8B998F;
  --gp-border: #E3EBE4; --gp-green-700: #1F5A42; --gp-green-600: #256B4E; --gp-green-500: #2E7D5B;
  --gp-green-100: #DCEEE4; --gp-green-50: #EFF7F2; --gp-orange-500: #F39C4A; --gp-orange-100: #FDE9D3;
  --gp-blue-500: #4A8FF3; --gp-blue-100: #DCE9FD; --gp-shadow-sm: 0 1px 2px rgba(28,43,34,0.06);
  --gp-shadow-md: 0 6px 20px rgba(28,43,34,0.08); --gp-radius-s: 10px; --gp-radius-m: 16px; --gp-radius-l: 22px; }
.gp-switcher { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.gp-phone { width: 390px; max-width: 100%; background: #0B1710; border-radius: 44px; padding: 12px; box-shadow: var(--gp-shadow-md); }
.gp-phone-screen { background: var(--gp-bg); border-radius: 34px; overflow: hidden; height: 760px; overflow-y: auto; position: relative; font-family: var(--gpf); color: var(--gp-ink); }
.gp-notch { position: sticky; top: 0; z-index: 5; display: flex; justify-content: center; padding-top: 8px; pointer-events: none; }
.gp-notch span { width: 90px; height: 22px; background: #0B1710; border-radius: 14px; }
.gp-screen-inner { padding: 0.25rem 1.1rem 2rem; }
.gp-app-topbar { display: flex; align-items: center; gap: 0.55rem; padding: 0.6rem 0 0.9rem; }
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
.gp-tl-head { padding: 0.4rem 0 0.9rem; }
.gp-tl-head h2 { font-size: 1.1rem; font-weight: 800; margin: 0 0 0.2rem; }
.gp-tl-head p { font-size: 0.8rem; color: var(--gp-ink-soft); margin: 0; }
.gp-tl { position: relative; padding-left: 1.6rem; }
.gp-tl::before { content: ""; position: absolute; left: 7px; top: 6px; bottom: 6px; width: 2px; background: var(--gp-border); }
.gp-tl-item { position: relative; margin-bottom: 1.15rem; }
.gp-tl-dot { position: absolute; left: -1.6rem; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--gp-green-500); border: 3px solid var(--gp-green-50); }
.gp-tl-item.gp-home .gp-tl-dot { background: var(--gp-orange-500); }
.gp-tl-item.gp-clinic .gp-tl-dot { background: var(--gp-blue-500); }
.gp-tl-date { font-size: 0.7rem; font-weight: 800; color: var(--gp-ink-faint); margin-bottom: 0.25rem; }
.gp-tl-card { background: var(--gp-panel); border: 1px solid var(--gp-border); border-radius: var(--gp-radius-s); padding: 0.8rem 0.9rem; }
.gp-tl-title { font-weight: 700; font-size: 0.86rem; margin-bottom: 0.3rem; line-height: 1.4; }
.gp-tl-tags { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.4rem; }
.gp-tag { font-size: 0.66rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 999px; }
.gp-tag-clinic { background: var(--gp-blue-100); color: var(--gp-blue-500); }
.gp-tag-home { background: var(--gp-orange-100); color: #B5701F; }
.gp-tag-first { background: var(--gp-green-100); color: var(--gp-green-700); }
.gp-dom-tabs { display: flex; gap: 0.4rem; margin: 0.3rem 0 1rem; overflow-x: auto; }
.gp-dom-tabs span { font-size: 0.76rem; font-weight: 700; padding: 0.45rem 0.8rem; border-radius: 999px; background: var(--gp-panel); border: 1px solid var(--gp-border); color: var(--gp-ink-soft); white-space: nowrap; cursor: pointer; }
.gp-dom-tabs span.gp-active { background: var(--gp-green-600); border-color: var(--gp-green-600); color: white; }
.gp-level-card { padding: 1.1rem 1.1rem 1.2rem; }
.gp-dom-name { font-size: 0.76rem; font-weight: 800; color: var(--gp-ink-faint); text-transform: uppercase; letter-spacing: 0.05em; }
.gp-dom-line { font-size: 0.95rem; font-weight: 700; margin: 0.25rem 0 0.9rem; }
.gp-band { position: relative; height: 10px; border-radius: 999px; background: linear-gradient(90deg, var(--gp-border) 0%, var(--gp-orange-100) 35%, var(--gp-orange-500) 65%, var(--gp-green-500) 100%); margin-bottom: 0.5rem; }
.gp-band-marker { position: absolute; top: -5px; width: 20px; height: 20px; border-radius: 50%; background: white; border: 3px solid var(--gp-green-600); box-shadow: var(--gp-shadow-sm); transform: translateX(-50%); }
.gp-band-labels { display: flex; justify-content: space-between; font-size: 0.64rem; color: var(--gp-ink-faint); font-weight: 700; }
.gp-dash-skill { display: block; width: 100%; padding: 0.85rem 0.1rem; border-bottom: 1px solid var(--gp-border); border-left: none; border-right: none; border-top: none; background: none; font-family: var(--gpf); text-align: left; cursor: pointer; }
.gp-dash-skill:last-child { border-bottom: none; }
.gp-dash-row1 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem; gap: 0.5rem; }
.gp-dash-name { font-weight: 700; font-size: 0.86rem; }
.gp-trend-chip { font-size: 0.66rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 999px; background: var(--gp-green-50); color: var(--gp-green-700); white-space: nowrap; }
.gp-trend-emerging { background: var(--gp-orange-100); color: #B5701F; }
.gp-mini-band { height: 6px; border-radius: 999px; background: var(--gp-border); position: relative; margin-bottom: 0.4rem; }
.gp-mini-band i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: var(--gp-green-500); display: block; }
.gp-trust-strip { display: flex; gap: 0.7rem; align-items: flex-start; background: var(--gp-green-50); border: 1px solid var(--gp-green-100); border-radius: var(--gp-radius-s); padding: 0.75rem 0.85rem; margin-bottom: 0.9rem; }
.gp-trust-icon { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; background: var(--gp-green-500); color: white; font-size: 0.7rem; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.gp-trust-title { font-weight: 800; font-size: 0.82rem; color: var(--gp-green-700); margin-bottom: 0.1rem; }
.gp-trust-sub { font-size: 0.76rem; color: var(--gp-ink-soft); line-height: 1.4; }
.gp-teaser-card { padding: 1rem 1.1rem; }
.gp-teaser-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.7rem; }
.gp-teaser-title { font-weight: 800; font-size: 0.88rem; }
.gp-teaser-sub { font-size: 0.7rem; color: var(--gp-ink-faint); margin-top: 0.1rem; }
.gp-teaser-link { font-size: 0.74rem; font-weight: 800; color: var(--gp-green-600); flex-shrink: 0; }
.gp-teaser-row { font-size: 0.78rem; color: var(--gp-ink-soft); display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0; }
.gp-teaser-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--gp-green-500); flex-shrink: 0; }
.gp-teaser-dot.gp-home { background: var(--gp-orange-500); }
`;
