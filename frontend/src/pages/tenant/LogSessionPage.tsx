import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { Goal, Kid } from "../../api/types";
import { LogEvidenceForm } from "./LogEvidenceForm";
import { FreeTextLogForm } from "./FreeTextLogForm";

type Mode = "pick" | "note";

/** Standalone entry point for therapists logging practice -- deliberately separate from a kid's
 * own detail page, so a therapist can jump straight to "who, then what" without navigating into a
 * specific kid first. Both kid and goal are picked by typing and filtering, not scrolling a combo. */
export function LogSessionPage() {
  const { token } = useAuth();
  const [kids, setKids] = useState<Kid[]>([]);
  const [kidSearch, setKidSearch] = useState("");
  const [selectedKid, setSelectedKid] = useState<Kid | null>(null);

  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [goalSearch, setGoalSearch] = useState("");
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [mode, setMode] = useState<Mode>("pick");

  useEffect(() => {
    api.listKids(token!).then(setKids);
  }, [token]);

  function loadGoals(kidId: string) {
    setGoals(null);
    api.listGoals(token!, kidId).then(setGoals);
  }

  function pickKid(k: Kid) {
    setSelectedKid(k);
    setSelectedGoal(null);
    setGoalSearch("");
    loadGoals(k.id);
  }

  function changeKid() {
    setSelectedKid(null);
    setGoals(null);
    setSelectedGoal(null);
    setKidSearch("");
    setGoalSearch("");
    setMode("pick");
  }

  function handleLogged(updatedGoal: Goal) {
    setSelectedGoal(updatedGoal);
    setGoals((prev) => (prev ? prev.map((g) => (g.id === updatedGoal.id ? updatedGoal : g)) : prev));
  }

  const kidQuery = kidSearch.trim().toLowerCase();
  const filteredKids = kidQuery ? kids.filter((k) => `${k.firstName} ${k.lastName}`.toLowerCase().includes(kidQuery)) : kids;

  const goalQuery = goalSearch.trim().toLowerCase();
  const filteredGoals = (goals ?? []).filter(
    (g) => !goalQuery || g.title.toLowerCase().includes(goalQuery) || g.canonicalSkill.name.toLowerCase().includes(goalQuery)
  );

  return (
    <div>
      <h1>Log a session</h1>
      <p className="hint-text" style={{ marginBottom: "1.25rem" }}>
        Search for a kid, search for the goal you're working on, and log it -- no need to open their full profile first.
      </p>

      {!selectedKid ? (
        <>
          <input
            className="input"
            autoFocus
            placeholder="Search for a kid by name..."
            value={kidSearch}
            onChange={(e) => setKidSearch(e.target.value)}
            style={{ maxWidth: 420 }}
          />
          <ul className="taxonomy-list" style={{ marginTop: "0.75rem", maxWidth: 420 }}>
            {filteredKids.map((k) => (
              <li key={k.id}>
                <button type="button" className="taxonomy-item-btn" onClick={() => pickKid(k)}>
                  {k.firstName} {k.lastName}
                </button>
              </li>
            ))}
          </ul>
          {filteredKids.length === 0 ? <p className="empty-state">No kids match "{kidSearch}".</p> : null}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <strong style={{ fontSize: "1.1rem" }}>
              {selectedKid.firstName} {selectedKid.lastName}
            </strong>
            <button type="button" className="btn btn-secondary" onClick={changeKid} style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }}>
              Change kid
            </button>
          </div>

          <div className="page-toolbar" style={{ marginBottom: "1.25rem" }}>
            <button
              type="button"
              className={`btn ${mode === "pick" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setMode("pick");
                setSelectedGoal(null);
              }}
            >
              Pick a goal
            </button>
            <button type="button" className={`btn ${mode === "note" ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode("note")}>
              Write a note (AI-assisted)
            </button>
          </div>

          {mode === "note" ? (
            <FreeTextLogForm kidId={selectedKid.id} onLogged={() => loadGoals(selectedKid.id)} />
          ) : !selectedGoal ? (
            <>
              <input
                className="input"
                autoFocus
                placeholder="Search for a goal..."
                value={goalSearch}
                onChange={(e) => setGoalSearch(e.target.value)}
                style={{ maxWidth: 420 }}
              />
              {!goals ? (
                <p className="empty-state">Loading goals...</p>
              ) : (
                <ul className="taxonomy-list" style={{ marginTop: "0.75rem", maxWidth: 420 }}>
                  {filteredGoals.map((g) => (
                    <li key={g.id}>
                      <button type="button" className="taxonomy-item-btn" onClick={() => setSelectedGoal(g)}>
                        {g.title} <span className="hint-text">({g.canonicalSkill.name})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {goals && filteredGoals.length === 0 ? (
                <p className="empty-state">{goals.length === 0 ? "This kid has no goals yet." : `No goals match "${goalSearch}".`}</p>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedGoal(null)} style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }}>
                  ← Pick a different goal
                </button>
                <div className="hint-text" style={{ marginTop: "0.4rem" }}>
                  Logging: <strong style={{ color: "var(--color-text)" }}>{selectedGoal.title}</strong>
                </div>
              </div>
              <LogEvidenceForm goal={selectedGoal} onLogged={handleLogged} />
            </>
          )}
        </>
      )}
    </div>
  );
}
