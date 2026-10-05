import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { Kid } from "../../api/types";
import { KidGoalsTab } from "./KidGoalsTab";
import { KidGrowthTab } from "./KidGrowthTab";
import { KidSupportTeamTab } from "./KidSupportTeamTab";

type Tab = "goals" | "growth" | "team";

export function KidDetailPage() {
  const { kidId } = useParams<{ kidId: string }>();
  const { token, user } = useAuth();
  const [kid, setKid] = useState<Kid | null>(null);
  const [tab, setTab] = useState<Tab>("goals");
  const canEdit = user?.role !== "VIEWER";

  function load() {
    if (!kidId) return;
    api.listKids(token!).then((kids) => setKid(kids.find((k) => k.id === kidId) ?? null));
  }

  useEffect(load, [token, kidId]);

  if (!kidId) return null;
  if (!kid) return <p className="empty-state">Loading...</p>;

  const kidLabel = `${kid.firstName} ${kid.lastName}`;

  return (
    <div>
      <Link to="/tenant/kids" className="hint-text" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
        ← Back to Kids
      </Link>
      <h1>
        {kidLabel} <span className="hint-text" style={{ fontWeight: 400, fontSize: "0.9rem" }}>{kid.status}</span>
      </h1>

      <div className="page-toolbar" style={{ marginBottom: "1.25rem" }}>
        <button type="button" className={`btn ${tab === "goals" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("goals")}>
          Goals
        </button>
        <button type="button" className={`btn ${tab === "growth" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("growth")}>
          Growth
        </button>
        <button type="button" className={`btn ${tab === "team" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("team")}>
          Support Team
        </button>
      </div>

      {tab === "goals" ? <KidGoalsTab kidId={kid.id} canEdit={canEdit} /> : null}
      {tab === "growth" ? <KidGrowthTab kidId={kid.id} kidLabel={kidLabel} /> : null}
      {tab === "team" ? <KidSupportTeamTab kid={kid} canEdit={canEdit} onUpdated={load} /> : null}
    </div>
  );
}
