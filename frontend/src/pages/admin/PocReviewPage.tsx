import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { PocReviewChild, PocReviewChildDetail } from "../../api/types";

function PassBadge({ provider, model }: { provider: string; model: string }) {
  return (
    <span className="tag tag-framework" title={model}>
      {provider.charAt(0).toUpperCase() + provider.slice(1)} &middot; Pass 1
    </span>
  );
}

function confidencePct(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

export function PocReviewPage() {
  const { token } = useAuth();
  const [children, setChildren] = useState<PocReviewChild[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<PocReviewChildDetail | null>(null);
  const [tab, setTab] = useState<"goals" | "logs">("goals");

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
                <button type="button" className={`btn ${tab === "goals" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("goals")}>
                  Goal tags ({detail.goalTags.length})
                </button>
                <button type="button" className={`btn ${tab === "logs" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("logs")}>
                  Log evidence ({detail.logEvidence.length})
                </button>
              </div>

              {tab === "goals" ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Goal title</th>
                        <th>Original domain / category</th>
                        <th>Predicted domain</th>
                        <th>Predicted skill</th>
                        <th>Confidence</th>
                        <th>Status</th>
                        <th>Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.goalTags.map((g) => (
                        <tr key={g.id}>
                          <td>{g.goalTitle}</td>
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
                        <th>Date</th>
                        <th>Predicted skill</th>
                        <th>Item hint</th>
                        <th>Outcome</th>
                        <th>Support</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.logEvidence.map((e) => (
                        <tr key={e.id}>
                          <td>{e.logDate ? new Date(e.logDate).toLocaleDateString() : "—"}</td>
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
