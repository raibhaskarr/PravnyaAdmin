import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { PocGoalTag, PocLogEvidenceRow, PocReviewChild, PocReviewChildDetail } from "../../api/types";

function providerLabel(provider: string) {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Lets a reviewer flip between independently-run passes (one per AI provider) over the exact
 * same goals/logs for this child, to compare how differently each model tags the same evidence. */
function ProviderToggle({
  providers,
  selected,
  onSelect,
  modelNameByProvider
}: {
  providers: string[];
  selected: string;
  onSelect: (p: string) => void;
  modelNameByProvider: Record<string, string>;
}) {
  if (providers.length <= 1) {
    const only = providers[0];
    return only ? (
      <span className="tag tag-framework" title={modelNameByProvider[only]}>
        {providerLabel(only)} pass
      </span>
    ) : null;
  }
  return (
    <div style={{ display: "flex", gap: "0.4rem" }}>
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          title={modelNameByProvider[p]}
          className={`btn ${p === selected ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "0.25rem 0.75rem" }}
        >
          {providerLabel(p)} pass
        </button>
      ))}
    </div>
  );
}

// Dotted underline is the visual cue that a column header has an explanatory tooltip (native
// title attribute) -- plain <th title="..."> gives no hint that hovering does anything.
function Th({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <th title={tip} style={{ textDecoration: "underline dotted", textDecorationColor: "var(--color-border)", cursor: "help" }}>
      {children}
    </th>
  );
}

function confidencePct(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function MatchedItemCell({ row }: { row: { predictedItem: { displayName: string } | null; itemMatchMethod: string | null; itemMatchScore: number | null } }) {
  if (row.itemMatchMethod === "ai" && row.predictedItem) {
    return (
      <>
        {row.predictedItem.displayName}
        <div className="hint-text">{confidencePct(row.itemMatchScore)} match</div>
      </>
    );
  }
  if (row.itemMatchMethod === "ai_no_match") {
    return <span className="hint-text">no real item fit</span>;
  }
  if (row.itemMatchMethod === "no_hint") {
    return <span className="hint-text">no item mentioned</span>;
  }
  if (row.itemMatchMethod === "not_applicable") {
    return <span className="hint-text">n/a</span>;
  }
  return "—";
}

interface ProviderStats {
  provider: string;
  goalsTotal: number;
  goalsTagged: number;
  goalsNoMatch: number;
  goalsError: number;
  avgGoalConfidence: number | null;
  evidenceTotal: number;
  avgEvidenceConfidence: number | null;
  outcomeCounts: Record<string, number>;
  supportCounts: Record<string, number>;
  itemMatchCounts: Record<string, number>;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function computeProviderStats(provider: string, goalTags: PocGoalTag[], logEvidence: PocLogEvidenceRow[]): ProviderStats {
  const goals = goalTags.filter((g) => g.modelProvider === provider);
  const evidence = logEvidence.filter((e) => e.modelProvider === provider);
  const outcomeCounts: Record<string, number> = {};
  const supportCounts: Record<string, number> = {};
  const itemMatchCounts: Record<string, number> = {};
  for (const e of evidence) {
    outcomeCounts[e.outcome] = (outcomeCounts[e.outcome] ?? 0) + 1;
    supportCounts[e.supportLevel] = (supportCounts[e.supportLevel] ?? 0) + 1;
    const method = e.itemMatchMethod ?? "none";
    itemMatchCounts[method] = (itemMatchCounts[method] ?? 0) + 1;
  }
  return {
    provider,
    goalsTotal: goals.length,
    goalsTagged: goals.filter((g) => g.status === "TAGGED").length,
    goalsNoMatch: goals.filter((g) => g.status === "NO_MATCH").length,
    goalsError: goals.filter((g) => g.status === "ERROR").length,
    avgGoalConfidence: average(goals.map((g) => g.confidence).filter((v): v is number => v != null)),
    evidenceTotal: evidence.length,
    avgEvidenceConfidence: average(evidence.map((e) => e.confidence).filter((v): v is number => v != null)),
    outcomeCounts,
    supportCounts,
    itemMatchCounts
  };
}

interface GoalAgreement {
  comparable: number;
  agree: number;
}

/** Matches goal tags across the two providers by goal title (the same source goal, tagged twice --
 * once per provider) to see how often they land on the same Canonical Skill. */
function computeGoalAgreement(goalTags: PocGoalTag[], providerA: string, providerB: string): GoalAgreement {
  const byTitleA = new Map<string, PocGoalTag>();
  for (const g of goalTags) if (g.modelProvider === providerA) byTitleA.set(g.goalTitle, g);

  let comparable = 0;
  let agree = 0;
  for (const g of goalTags) {
    if (g.modelProvider !== providerB) continue;
    const other = byTitleA.get(g.goalTitle);
    if (!other) continue;
    if (!g.predictedSkill && !other.predictedSkill) {
      comparable += 1;
      agree += 1;
      continue;
    }
    comparable += 1;
    if (g.predictedSkill && other.predictedSkill && g.predictedSkill.id === other.predictedSkill.id) agree += 1;
  }
  return { comparable, agree };
}

function pct(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : "—";
}

// PocEvidenceOutcome/PocSupportLevel values from the API are upper-case ("CORRECT",
// "INDEPENDENT", ...) -- these must match exactly, or every lookup below silently misses.
const OUTCOME_ORDER = ["CORRECT", "PARTIAL", "ATTEMPTED", "INCORRECT", "NOT_OBSERVED", "UNKNOWN"];
const SUPPORT_ORDER = [
  "INDEPENDENT",
  "VISUAL_PROMPT",
  "VERBAL_PROMPT",
  "GESTURAL_PROMPT",
  "PHYSICAL_PROMPT",
  "PARTIAL_ASSISTANCE",
  "FULL_ASSISTANCE",
  "UNKNOWN"
];

/** Side-by-side quality comparison between two independently-run AI provider passes over the same
 * goals and logs -- lets a reviewer see volume/confidence/outcome differences at a glance instead
 * of having to flip the pass toggle back and forth and remember numbers. */
function ComparePassesCard({ detail, providers }: { detail: PocReviewChildDetail; providers: string[] }) {
  const [open, setOpen] = useState(true);
  if (providers.length < 2) return null;
  const [providerA, providerB] = providers;
  const statsA = computeProviderStats(providerA, detail.goalTags, detail.logEvidence);
  const statsB = computeProviderStats(providerB, detail.goalTags, detail.logEvidence);
  const agreement = computeGoalAgreement(detail.goalTags, providerA, providerB);

  return (
    <div className="card" style={{ marginBottom: "1.25rem" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="taxonomy-item-btn"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", border: "none", fontWeight: 600 }}
      >
        <span>
          {open ? "▾" : "▸"} Compare {providerLabel(providerA)} vs {providerLabel(providerB)}
        </span>
      </button>
      {open ? (
        <>
          <p className="hint-text" style={{ marginTop: "0.4rem", marginBottom: "0.75rem" }}>
            Both passes ran against the exact same {detail.label} goals and daily logs. Confidence is each model's own
            self-report, not independently verified.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>{providerLabel(providerA)}</th>
                  <th>{providerLabel(providerB)}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Goals tagged</td>
                  <td>
                    {statsA.goalsTagged} / {statsA.goalsTotal} ({pct(statsA.goalsTagged, statsA.goalsTotal)})
                  </td>
                  <td>
                    {statsB.goalsTagged} / {statsB.goalsTotal} ({pct(statsB.goalsTagged, statsB.goalsTotal)})
                  </td>
                </tr>
                <tr>
                  <td>No taxonomy match</td>
                  <td>{statsA.goalsNoMatch}</td>
                  <td>{statsB.goalsNoMatch}</td>
                </tr>
                <tr>
                  <td>Tagging errors</td>
                  <td>{statsA.goalsError}</td>
                  <td>{statsB.goalsError}</td>
                </tr>
                <tr>
                  <td>Avg goal confidence</td>
                  <td>{confidencePct(statsA.avgGoalConfidence)}</td>
                  <td>{confidencePct(statsB.avgGoalConfidence)}</td>
                </tr>
                <tr>
                  <td>Log evidence rows extracted</td>
                  <td>{statsA.evidenceTotal}</td>
                  <td>{statsB.evidenceTotal}</td>
                </tr>
                <tr>
                  <td>Avg evidence confidence</td>
                  <td>{confidencePct(statsA.avgEvidenceConfidence)}</td>
                  <td>{confidencePct(statsB.avgEvidenceConfidence)}</td>
                </tr>
                <tr>
                  <td>Item match rate (of evidence with a hint)</td>
                  <td>
                    {pct(statsA.itemMatchCounts.ai ?? 0, (statsA.itemMatchCounts.ai ?? 0) + (statsA.itemMatchCounts.ai_no_match ?? 0))}
                  </td>
                  <td>
                    {pct(statsB.itemMatchCounts.ai ?? 0, (statsB.itemMatchCounts.ai ?? 0) + (statsB.itemMatchCounts.ai_no_match ?? 0))}
                  </td>
                </tr>
                <tr>
                  <td>Evidence with no specific item named</td>
                  <td>
                    {statsA.itemMatchCounts.no_hint ?? 0} ({pct(statsA.itemMatchCounts.no_hint ?? 0, statsA.evidenceTotal)})
                  </td>
                  <td>
                    {statsB.itemMatchCounts.no_hint ?? 0} ({pct(statsB.itemMatchCounts.no_hint ?? 0, statsB.evidenceTotal)})
                  </td>
                </tr>
                {OUTCOME_ORDER.map((outcome) => (
                  <tr key={outcome}>
                    <td className="hint-text">Outcome: {outcome.replace("_", " ")}</td>
                    <td>
                      {statsA.outcomeCounts[outcome] ?? 0} ({pct(statsA.outcomeCounts[outcome] ?? 0, statsA.evidenceTotal)})
                    </td>
                    <td>
                      {statsB.outcomeCounts[outcome] ?? 0} ({pct(statsB.outcomeCounts[outcome] ?? 0, statsB.evidenceTotal)})
                    </td>
                  </tr>
                ))}
                {SUPPORT_ORDER.map((support) => (
                  <tr key={support}>
                    <td className="hint-text">Support: {support.replace("_", " ")}</td>
                    <td>
                      {statsA.supportCounts[support] ?? 0} ({pct(statsA.supportCounts[support] ?? 0, statsA.evidenceTotal)})
                    </td>
                    <td>
                      {statsB.supportCounts[support] ?? 0} ({pct(statsB.supportCounts[support] ?? 0, statsB.evidenceTotal)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint-text" style={{ marginTop: "0.75rem" }}>
            <strong>Goal-skill agreement:</strong> of {agreement.comparable} goals both passes tagged, they picked the
            same Canonical Skill (or both found no match) {agreement.agree} times ({pct(agreement.agree, agreement.comparable)}).
          </p>
        </>
      ) : null}
    </div>
  );
}

interface SkillGroup {
  skillId: string;
  skillName: string;
  domainName: string;
  goals: PocGoalTag[];
  evidence: PocLogEvidenceRow[];
}

/** One row per Canonical Skill that either a goal or a piece of log evidence resolved to for this
 * child -- lets a reviewer look at a single skill and see the goal(s) about it next to every real
 * log that showed evidence for it, instead of cross-referencing two separate flat tables. */
function buildSkillGroups(detail: PocReviewChildDetail): { groups: SkillGroup[]; unmatchedGoals: PocGoalTag[] } {
  const groups = new Map<string, SkillGroup>();

  function groupFor(skill: { id: string; name: string; domain: { name: string } }): SkillGroup {
    let group = groups.get(skill.id);
    if (!group) {
      group = { skillId: skill.id, skillName: skill.name, domainName: skill.domain.name, goals: [], evidence: [] };
      groups.set(skill.id, group);
    }
    return group;
  }

  for (const g of detail.goalTags) {
    if (g.predictedSkill) groupFor(g.predictedSkill).goals.push(g);
  }
  for (const e of detail.logEvidence) {
    if (e.predictedSkill) groupFor(e.predictedSkill).evidence.push(e);
  }

  const groupsList = [...groups.values()].sort((a, b) => b.evidence.length - a.evidence.length || b.goals.length - a.goals.length);
  const unmatchedGoals = detail.goalTags.filter((g) => !g.predictedSkill);
  return { groups: groupsList, unmatchedGoals };
}

interface ItemGroup {
  key: string;
  label: string;
  evidence: PocLogEvidenceRow[];
}

/** Groups one skill's evidence by the real item it resolved to (or by hint/absence when it
 * didn't), so a reviewer sees "Apple: 6" rather than six separate rows that all say "Apple". */
function groupEvidenceByItem(evidence: PocLogEvidenceRow[]): ItemGroup[] {
  const map = new Map<string, ItemGroup>();
  for (const e of evidence) {
    let key: string;
    let label: string;
    if (e.itemMatchMethod === "ai" && e.predictedItem) {
      key = `item:${e.predictedItem.id}`;
      label = e.predictedItem.displayName;
    } else if (e.itemMatchMethod === "ai_no_match") {
      // Normalize casing/whitespace so "cow" and "Cow " collapse into one bucket instead of
      // fragmenting -- the raw hint text comes straight from free-form log extraction.
      const normalizedHint = e.itemHint?.trim().toLowerCase() || null;
      key = `nomatch:${normalizedHint ?? ""}`;
      label = normalizedHint ? `"${normalizedHint}" (no real item fit)` : "No real item fit";
    } else if (e.itemMatchMethod === "no_hint") {
      key = "no_hint";
      label = "No specific item mentioned in log";
    } else {
      key = "not_applicable";
      label = "Skill doesn't track items";
    }
    let group = map.get(key);
    if (!group) {
      group = { key, label, evidence: [] };
      map.set(key, group);
    }
    group.evidence.push(e);
  }
  return [...map.values()].sort((a, b) => b.evidence.length - a.evidence.length);
}

export function PocReviewPage() {
  const { token } = useAuth();
  const [children, setChildren] = useState<PocReviewChild[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<PocReviewChildDetail | null>(null);
  const [tab, setTab] = useState<"byskill" | "goals" | "logs">("byskill");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState<string>("");

  const availableProviders = useMemo(() => {
    if (!detail) return [];
    const set = new Set<string>();
    for (const g of detail.goalTags) set.add(g.modelProvider);
    for (const e of detail.logEvidence) set.add(e.modelProvider);
    return [...set].sort();
  }, [detail]);

  const modelNameByProvider = useMemo(() => {
    const map: Record<string, string> = {};
    if (!detail) return map;
    for (const g of detail.goalTags) map[g.modelProvider] = g.modelName;
    for (const e of detail.logEvidence) map[e.modelProvider] = e.modelName;
    return map;
  }, [detail]);

  useEffect(() => {
    if (availableProviders.length && !availableProviders.includes(provider)) {
      setProvider(availableProviders[0]);
    }
  }, [availableProviders, provider]);

  const filteredDetail = useMemo<PocReviewChildDetail | null>(() => {
    if (!detail) return null;
    return {
      ...detail,
      goalTags: detail.goalTags.filter((g) => g.modelProvider === provider),
      logEvidence: detail.logEvidence.filter((e) => e.modelProvider === provider)
    };
  }, [detail, provider]);

  const skillView = useMemo(() => (filteredDetail ? buildSkillGroups(filteredDetail) : null), [filteredDetail]);

  function toggleExpanded(key: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    api.listPocReviewChildren(token!).then((rows) => {
      setChildren(rows);
      if (rows.length) setSelectedId(rows[0].id);
    });
  }, [token]);

  useEffect(() => {
    if (!selectedId) return;
    setDetail(null);
    setProvider("");
    api.getPocReviewChild(token!, selectedId).then(setDetail);
  }, [token, selectedId]);

  const taggedGoals = filteredDetail?.goalTags.filter((g) => g.status === "TAGGED") ?? [];
  const noMatchGoals = filteredDetail?.goalTags.filter((g) => g.status === "NO_MATCH") ?? [];
  const evidenceCount = filteredDetail?.logEvidence.length ?? 0;

  return (
    <div>
      <h1>AI Tagging POC Review</h1>
      <p className="hint-text" style={{ marginBottom: "1.25rem" }}>
        Read-only review of the goal/skill and daily-log/evidence tagging experiment against the real Canonical
        Skill taxonomy, for two real children not yet imported as Kids. Not tenant data, not a production feature.
      </p>

      <div className="taxonomy-columns">
        <div className="taxonomy-col taxonomy-col-domains">
          <h2>Children</h2>
          <ul className="taxonomy-list">
            {children.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`taxonomy-item-btn ${c.id === selectedId ? "active" : ""}`}
                >
                  {c.label}
                  {c._count ? ` (${c._count.goalTags} goals, ${c._count.logEvidence} evidence)` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="taxonomy-col-items" style={{ flex: 1 }}>
          {!detail || !filteredDetail ? (
            <p className="empty-state">{children.length ? "Loading..." : "No review children imported yet."}</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>{detail.label}</h2>
                <ProviderToggle
                  providers={availableProviders}
                  selected={provider}
                  onSelect={setProvider}
                  modelNameByProvider={modelNameByProvider}
                />
              </div>

              <ComparePassesCard detail={detail} providers={availableProviders} />

              <div className="card" style={{ marginBottom: "1.25rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                <div>
                  <div className="field-label">Goals tagged</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                    {taggedGoals.length} / {filteredDetail.goalTags.length}
                  </div>
                </div>
                <div>
                  <div className="field-label">No taxonomy match</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{noMatchGoals.length}</div>
                </div>
                <div>
                  <div className="field-label">Log evidence items</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{evidenceCount}</div>
                </div>
              </div>

              <div className="page-toolbar" style={{ marginBottom: "0.75rem" }}>
                <button type="button" className={`btn ${tab === "byskill" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("byskill")}>
                  By skill ({skillView?.groups.length ?? 0})
                </button>
                <button type="button" className={`btn ${tab === "goals" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("goals")}>
                  Goal tags ({filteredDetail.goalTags.length})
                </button>
                <button type="button" className={`btn ${tab === "logs" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("logs")}>
                  Log evidence ({filteredDetail.logEvidence.length})
                </button>
              </div>

              {tab === "byskill" && skillView ? (
                <>
                  {skillView.groups.map((group) => (
                    <div key={group.skillId} className="card" style={{ marginBottom: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div>
                          <strong>{group.skillName}</strong>
                          <div className="hint-text">{group.domainName}</div>
                        </div>
                        <span className="hint-text">
                          {group.evidence.length} evidence &middot; {group.goals.length} goal{group.goals.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {group.goals.length > 0 ? (
                        <div style={{ marginBottom: "0.75rem" }}>
                          {group.goals.map((g) => (
                            <div key={g.id} className="hint-text" style={{ marginBottom: "0.25rem" }}>
                              Goal: <span style={{ color: "var(--color-text)" }}>{g.goalTitle}</span> ({confidencePct(g.confidence)} confidence)
                              {g.centreName ? <span className="tag tag-framework" style={{ marginLeft: "0.5rem" }}>{g.centreName}</span> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="hint-text" style={{ marginBottom: "0.75rem" }}>
                          No goal was tagged to this skill for this child -- only log evidence references it.
                        </p>
                      )}

                      {group.evidence.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                          {groupEvidenceByItem(group.evidence).map((itemGroup) => {
                            const expandKey = `${group.skillId}:${itemGroup.key}`;
                            const isOpen = expandedItems.has(expandKey);
                            return (
                              <div key={itemGroup.key}>
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(expandKey)}
                                  className="taxonomy-item-btn"
                                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", border: "1px solid var(--color-border)" }}
                                >
                                  <span>
                                    {isOpen ? "▾" : "▸"} {itemGroup.label}
                                  </span>
                                  <span className="tag tag-framework">{itemGroup.evidence.length}</span>
                                </button>
                                {isOpen ? (
                                  <div className="table-wrap" style={{ marginTop: "0.4rem" }}>
                                    <table className="data-table">
                                      <thead>
                                        <tr>
                                          <Th tip="The date this daily log entry was recorded.">Date</Th>
                                          <Th tip="The therapy centre this log's enrollment pointed to in PranTrackingSystem. Most logs are home logs with no centre set.">
                                            Centre
                                          </Th>
                                          <Th tip="What happened, as judged by the AI from the log text: correct, incorrect, partial, attempted, not observed, or unknown.">
                                            Outcome
                                          </Th>
                                          <Th tip="The level of prompting/assistance the child needed, as judged by the AI from the log text. 'Unknown' usually means the log didn't state it explicitly.">
                                            Support
                                          </Th>
                                          <Th tip="The AI's self-reported confidence in this extraction (0-100%). Not independently verified.">
                                            Extraction confidence
                                          </Th>
                                          <Th tip="The AI's self-reported confidence that this evidence really belongs to the item shown above (0-100%).">
                                            Item match confidence
                                          </Th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {itemGroup.evidence.map((e) => (
                                          <tr key={e.id}>
                                            <td>{e.logDate ? new Date(e.logDate).toLocaleDateString() : "—"}</td>
                                            <td>{e.centreName ?? "—"}</td>
                                            <td>{e.outcome.replace("_", " ")}</td>
                                            <td>{e.supportLevel.replace("_", " ")}</td>
                                            <td>{confidencePct(e.confidence)}</td>
                                            <td>{e.itemMatchMethod === "ai" ? confidencePct(e.itemMatchScore) : "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="hint-text">No log evidence matched this skill yet.</p>
                      )}
                    </div>
                  ))}

                  {skillView.unmatchedGoals.length > 0 ? (
                    <div className="card">
                      <strong>Goals with no taxonomy match</strong>
                      <p className="hint-text" style={{ marginTop: "0.3rem", marginBottom: "0.6rem" }}>
                        These goals didn't group under any skill above because the AI found no reasonable match in the taxonomy.
                      </p>
                      {skillView.unmatchedGoals.map((g) => (
                        <div key={g.id} style={{ marginBottom: "0.5rem" }}>
                          <span>{g.goalTitle}</span>
                          <div className="hint-text">{g.rationale ?? "No rationale given."}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {skillView.groups.length === 0 && skillView.unmatchedGoals.length === 0 ? (
                    <p className="empty-state">No goal tags or log evidence for this child.</p>
                  ) : null}
                </>
              ) : tab === "goals" ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <Th tip="The goal's title as written by the therapist, exactly as stored in PranTrackingSystem.">Goal title</Th>
                        <Th tip="The therapy centre(s) this goal is linked to in PranTrackingSystem. Null means home-only/unlinked.">Centre</Th>
                        <Th tip="The domain and category this goal was originally filed under in PranTrackingSystem -- not from the canonical taxonomy, and not something the AI saw as a fixed option.">
                          Original domain / category
                        </Th>
                        <Th tip="The Domain of the AI-predicted Canonical Skill (right), from PravnyaAdmin's live taxonomy. Compare against 'Original domain / category' to spot mismatches.">
                          Predicted domain
                        </Th>
                        <Th tip="The single best-matching Canonical Skill the AI selected from the full 148-skill taxonomy for this goal.">Predicted skill</Th>
                        <Th tip="The AI's self-reported confidence in this match (0-100%). Not independently verified.">Confidence</Th>
                        <Th tip="TAGGED = matched to a skill. NO_MATCH = the AI found no reasonable skill in the taxonomy for this goal -- a real finding, not an error. ERROR = the AI call itself failed.">
                          Status
                        </Th>
                        <Th tip="The AI's one-sentence explanation for why it chose this skill, or why it found no match.">Rationale</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDetail.goalTags.map((g) => (
                        <tr key={g.id}>
                          <td>{g.goalTitle}</td>
                          <td>{g.centreName ?? "—"}</td>
                          <td>
                            {g.originalDomainName ?? "—"}
                            {g.originalCategory ? <div className="hint-text">{g.originalCategory}</div> : null}
                          </td>
                          <td>{g.predictedSkill?.domain.name ?? "—"}</td>
                          <td>{g.predictedSkill?.name ?? "—"}</td>
                          <td>{confidencePct(g.confidence)}</td>
                          <td>{g.status.replace("_", " ")}</td>
                          <td style={{ maxWidth: 360 }}>{g.rationale ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredDetail.goalTags.length === 0 ? <p className="empty-state">No goal tags for this child.</p> : null}
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <Th tip="The date this daily log entry was recorded.">Date</Th>
                        <Th tip="The therapy centre this log's enrollment pointed to in PranTrackingSystem. Most logs are home logs with no centre set.">
                          Centre
                        </Th>
                        <Th tip="The Canonical Skill (and its Domain) this specific piece of evidence was matched to. A single log can yield several evidence rows against different skills.">
                          Predicted skill
                        </Th>
                        <Th tip="The free-text item/vocabulary/task the first AI pass pulled from the log, before any matching against the real item bank.">
                          Item hint
                        </Th>
                        <Th tip="The real Canonical Skill Item the hint was matched to, via a second AI call constrained to just that skill's own item candidates. 'no real item fit' means a hint existed but didn't match a real item; 'no item mentioned' means the log didn't name a specific item for this skill; 'n/a' means this skill doesn't track items at all.">
                          Matched item
                        </Th>
                        <Th tip="What happened, as judged by the AI from the log text: correct, incorrect, partial, attempted, not observed, or unknown.">Outcome</Th>
                        <Th tip="The level of prompting/assistance the child needed, as judged by the AI from the log text. 'Unknown' usually means the log didn't state it explicitly.">
                          Support
                        </Th>
                        <Th tip="The AI's self-reported confidence in this extraction (0-100%). Not independently verified.">Confidence</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDetail.logEvidence.map((e) => (
                        <tr key={e.id}>
                          <td>{e.logDate ? new Date(e.logDate).toLocaleDateString() : "—"}</td>
                          <td>{e.centreName ?? "—"}</td>
                          <td>
                            {e.predictedSkill ? (
                              <>
                                {e.predictedSkill.name}
                                <div className="hint-text">{e.predictedSkill.domain.name}</div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{e.itemHint ?? "—"}</td>
                          <td>
                            <MatchedItemCell row={e} />
                          </td>
                          <td>{e.outcome.replace("_", " ")}</td>
                          <td>{e.supportLevel.replace("_", " ")}</td>
                          <td>{confidencePct(e.confidence)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredDetail.logEvidence.length === 0 ? <p className="empty-state">No log evidence for this child.</p> : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
