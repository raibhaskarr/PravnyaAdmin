import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TabView, TabPanel } from "primereact/tabview";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { Kid } from "../../api/types";
import { KidGoalsTab } from "./KidGoalsTab";
import { KidGrowthTab } from "./KidGrowthTab";
import { KidSupportTeamTab } from "./KidSupportTeamTab";

export function KidDetailPage() {
  const { kidId } = useParams<{ kidId: string }>();
  const { token, user } = useAuth();
  const [kid, setKid] = useState<Kid | null>(null);
  const canEdit = user?.role !== "VIEWER";
  // Inviting or reassigning a kid's support team is a Tenant Admin call, not a therapist's --
  // even a therapist already assigned to this kid can't bring on another therapist for it.
  const canManageTeam = user?.role === "TENANT_ADMIN";

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

      <TabView renderActiveOnly>
        <TabPanel header="Goals">
          <KidGoalsTab kidId={kid.id} canEdit={canEdit} />
        </TabPanel>
        <TabPanel header="Growth">
          <KidGrowthTab kidId={kid.id} kidLabel={kidLabel} />
        </TabPanel>
        <TabPanel header="Support Team">
          <KidSupportTeamTab kid={kid} canEdit={canManageTeam} onUpdated={load} />
        </TabPanel>
      </TabView>
    </div>
  );
}
