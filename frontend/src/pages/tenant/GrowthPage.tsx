import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { Goal, Kid } from "../../api/types";
import { RealGrowthView } from "./realGrowth";

export function GrowthPage() {
  const { token } = useAuth();
  const [kids, setKids] = useState<Kid[]>([]);
  const [selectedKidId, setSelectedKidId] = useState("");
  const [goals, setGoals] = useState<Goal[] | null>(null);

  useEffect(() => {
    api.listKids(token!).then((rows) => {
      setKids(rows);
      if (rows.length) setSelectedKidId(rows[0].id);
    });
  }, [token]);

  useEffect(() => {
    if (!selectedKidId) return;
    setGoals(null);
    api.listGoals(token!, selectedKidId).then(setGoals);
  }, [token, selectedKidId]);

  const selectedKid = kids.find((k) => k.id === selectedKidId);
  const kidLabel = selectedKid ? `${selectedKid.firstName} ${selectedKid.lastName}` : "";

  return (
    <div>
      <h1>Growth</h1>
      <p className="hint-text" style={{ marginBottom: "1.25rem" }}>
        Real practice history for this kid's goals -- sourced from actual Goal/GoalItem/GoalItemEvidence records, not the AI tagging POC.
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
          {!goals ? <p className="empty-state">{selectedKidId ? "Loading..." : "Select a kid."}</p> : <RealGrowthView kidLabel={kidLabel} goals={goals} />}
        </div>
      </div>
    </div>
  );
}
