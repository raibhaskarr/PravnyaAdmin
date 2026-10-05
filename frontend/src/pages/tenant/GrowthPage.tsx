import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { Goal, GoalItemEvidenceRow, Kid } from "../../api/types";
import { GoalEvidenceDetail, OUTCOME_LABEL, formatDate, measurementLabel } from "./goalEvidence";

interface DomainGroup {
  domainName: string;
  goals: Goal[];
  evidenceCount: number;
}

function buildDomainGroups(goals: Goal[]): DomainGroup[] {
  const map = new Map<string, DomainGroup>();
  for (const g of goals) {
    const domainName = g.canonicalSkill.domain.name;
    const group = map.get(domainName) ?? { domainName, goals: [], evidenceCount: 0 };
    group.goals.push(g);
    group.evidenceCount += g.items.reduce((sum, i) => sum + i.evidence.length, 0);
    map.set(domainName, group);
  }
  return [...map.values()].sort((a, b) => b.evidenceCount - a.evidenceCount);
}

function allEvidenceSortedDesc(goal: Goal): GoalItemEvidenceRow[] {
  return goal.items
    .flatMap((i) => i.evidence)
    .sort((a, b) => new Date(b.logDate ?? 0).getTime() - new Date(a.logDate ?? 0).getTime());
}

function GoalCard({ goal, expanded, onToggle }: { goal: Goal; expanded: boolean; onToggle: () => void }) {
  const evidence = allEvidenceSortedDesc(goal);
  const latest = evidence[0];
  const latestLabel = latest ? measurementLabel(latest) ?? OUTCOME_LABEL[latest.outcome] ?? latest.outcome : null;

  return (
    <div className="card" style={{ marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <strong>{goal.title}</strong>
          <div className="hint-text">
            {goal.canonicalSkill.name} &middot; {goal.discipline.name} &middot; {goal.modality}
          </div>
        </div>
        <button type="button" className="btn btn-secondary" style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }} onClick={onToggle}>
          {expanded ? "Hide" : "History"} {evidence.length ? `(${evidence.length})` : ""}
        </button>
      </div>
      <div className="hint-text" style={{ marginTop: "0.4rem" }}>
        {evidence.length === 0
          ? "No practice logged yet"
          : `Last practiced ${formatDate(latest.logDate)} -- ${latestLabel}`}
      </div>
      {expanded ? (
        <div style={{ marginTop: "0.5rem" }}>
          <GoalEvidenceDetail goal={goal} />
        </div>
      ) : null}
    </div>
  );
}

export function GrowthPage() {
  const { token } = useAuth();
  const [kids, setKids] = useState<Kid[]>([]);
  const [selectedKidId, setSelectedKidId] = useState("");
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

  useEffect(() => {
    api.listKids(token!).then((rows) => {
      setKids(rows);
      if (rows.length) setSelectedKidId(rows[0].id);
    });
  }, [token]);

  useEffect(() => {
    if (!selectedKidId) return;
    setGoals(null);
    setExpandedGoalId(null);
    api.listGoals(token!, selectedKidId).then(setGoals);
  }, [token, selectedKidId]);

  const domainGroups = useMemo(() => (goals ? buildDomainGroups(goals) : []), [goals]);
  const totalEvidence = useMemo(() => (goals ? goals.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.evidence.length, 0), 0) : 0), [goals]);

  return (
    <div>
      <h1>Growth</h1>
      <p className="hint-text" style={{ marginBottom: "1.25rem" }}>
        Real practice history for this kid's goals, grouped by domain -- sourced from actual Goal/GoalItem records, not the AI tagging POC.
      </p>

      <div className="taxonomy-columns">
        <div className="taxonomy-col taxonomy-col-domains">
          <h2>Kids</h2>
          <ul className="taxonomy-list">
            {kids.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => setSelectedKidId(k.id)}
                  className={`taxonomy-item-btn ${k.id === selectedKidId ? "active" : ""}`}
                >
                  {k.firstName} {k.lastName}
                </button>
              </li>
            ))}
          </ul>
          {kids.length === 0 ? <p className="empty-state">No kids visible to your account yet.</p> : null}
        </div>

        <div className="taxonomy-col-items" style={{ flex: 1 }}>
          {!goals ? (
            <p className="empty-state">{selectedKidId ? "Loading..." : "Select a kid."}</p>
          ) : goals.length === 0 ? (
            <p className="empty-state">No goals for this kid yet.</p>
          ) : (
            <>
              <div className="card" style={{ marginBottom: "1.25rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                <div>
                  <div className="field-label">Goals</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{goals.length}</div>
                </div>
                <div>
                  <div className="field-label">Domains</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{domainGroups.length}</div>
                </div>
                <div>
                  <div className="field-label">Practice history entries</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{totalEvidence}</div>
                </div>
              </div>

              {domainGroups.map((group) => (
                <div key={group.domainName} style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ marginBottom: "0.5rem" }}>
                    {group.domainName} <span className="hint-text">({group.goals.length} goal{group.goals.length === 1 ? "" : "s"})</span>
                  </h3>
                  {group.goals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      expanded={expandedGoalId === goal.id}
                      onToggle={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)}
                    />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
