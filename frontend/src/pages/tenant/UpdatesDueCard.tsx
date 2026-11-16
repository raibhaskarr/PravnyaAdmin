import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { ProgressUpdateDue } from "../../api/types";

// Kids whose parent hasn't had an update in a week although new entries have been logged.
// Hidden when nothing is due, so it never nags.
export function UpdatesDueCard() {
  const { token, user } = useAuth();
  const [due, setDue] = useState<ProgressUpdateDue[]>([]);

  useEffect(() => {
    if (user?.role === "VIEWER") return;
    api.listProgressUpdatesDue(token!).then((rows) => setDue(rows.filter((r) => r.isDue))).catch(() => setDue([]));
  }, [token, user?.role]);

  if (due.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <span className="field-label">Parent updates due</span>
      <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
        {due.map((d) => (
          <li key={d.kidId}>
            <Link to={`/tenant/kids/${d.kidId}`}>{d.kidName}</Link>
            <span className="hint-text">
              {" "}
              · {d.newEntries} new {d.newEntries === 1 ? "entry" : "entries"} · {d.lastSentAt ? `last update ${new Date(d.lastSentAt).toLocaleDateString()}` : "no update sent yet"}
              {d.draftId ? " · draft waiting" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
