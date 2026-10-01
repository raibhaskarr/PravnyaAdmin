import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { PocGoalTag, PocLogEvidenceRow, PocReviewChild, PocReviewChildDetail } from "../../api/types";

function PassBadge({ provider, model }: { provider: string; model: string }) {
  return (
    <span className="tag tag-framework" title={model}>
      {provider.charAt(0).toUpperCase() + provider.slice(1)} &middot; Pass 1
    </span>
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
      key = `nomatch:${e.itemHint ?? ""}`;
      label = e.itemHint ? `"${e.itemHint}" (no real item fit)` : "No real item fit";
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

  const skillView = useMemo(() => (detail ? buildSkillGroups(detail) : null), [detail]);

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
    api.getPocReviewChild(token!, selectedId).then(setDetail);
  }, [token, selectedId]);

  const taggedGoals = detail?.goalTags.filter((g) => g.status === "TAGGED") ?? [];
  const noMatchGoals = detail?.goalTags.filter((g) => g.status === "NO_MATCH") ?? [];
  const evidenceCount = detail?.logEvidence.length ?? 0;

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
          {!detail ? (
            <p className="empty-state">{children.length ? "Loading..." : "No review children imported yet."}</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
                <h2 style={{ margin: 0 }}>{detail.label}</h2>
                {detail.goalTags[0] ? <PassBadge provider={detail.goalTags[0].modelProvider} model={detail.goalTags[0].modelName} /> : null}
              </div>

              <div className="card" style={{ marginBottom: "1.25rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                <div>
                  <div className="field-label">Goals tagged</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                    {taggedGoals.length} / {detail.goalTags.length}
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
                  Goal tags ({detail.goalTags.length})
                </button>
                <button type="button" className={`btn ${tab === "logs" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("logs")}>
                  Log evidence ({detail.logEvidence.length})
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
                      {detail.goalTags.map((g) => (
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
                  {detail.goalTags.length === 0 ? <p className="empty-state">No goal tags for this child.</p> : null}
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
                      {detail.logEvidence.map((e) => (
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
                  {detail.logEvidence.length === 0 ? <p className="empty-state">No log evidence for this child.</p> : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
