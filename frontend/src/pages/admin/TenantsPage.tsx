import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Tenant, TenantHealth, TenantInvitation } from "../../api/types";

const STATUS_LABEL: Record<TenantInvitation["status"], string> = {
  PENDING: "Invited — waiting to set up",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  REVOKED: "Revoked"
};

type TenantRow = Tenant & { health?: TenantHealth };

function headerWithTip(label: string, tip: string) {
  return <span title={tip}>{label}</span>;
}

export function TenantsPage() {
  const { token } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [health, setHealth] = useState<Record<string, TenantHealth>>({});
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devSignupUrl, setDevSignupUrl] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([api.listTenants(token!), api.listTenantInvitations(token!), api.listTenantHealth(token!)])
      .then(([t, inv, h]) => {
        setTenants(t);
        setInvitations(inv);
        setHealth(Object.fromEntries(h.map((row) => [row.tenantId, row])));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load tenants"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setError("");
    try {
      const result = await api.inviteTenant(token!, {
        name: String(form.get("name")),
        slug: String(form.get("slug")),
        email: String(form.get("email"))
      });
      setSentTo(result.invitation.email);
      setDevSignupUrl(result.signupUrl ?? null);
      setShowForm(false);
      formEl.reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invitation");
    }
  }

  async function handleRevoke(invitationId: string) {
    try {
      await api.revokeTenantInvitation(token!, invitationId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke invitation");
    }
  }

  async function toggleStatus(tenant: Tenant) {
    await api.updateTenant(token!, tenant.id, { status: tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" });
    load();
  }

  const pendingInvitations = invitations.filter((inv) => inv.status === "PENDING");
  const rows: TenantRow[] = tenants.map((t) => ({ ...t, health: health[t.id] }));

  return (
    <div>
      <h1>Tenants</h1>

      {sentTo ? (
        <div className="callout">
          <p>
            Invitation sent to <strong>{sentTo}</strong>. They'll show up here once they set up their account and fill in their business
            profile.
          </p>
          {devSignupUrl ? (
            <p className="hint-text">
              Signup link (also emailed): <code>{devSignupUrl}</code>
            </p>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => setSentTo(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="page-toolbar">
        <button type="button" className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Invite a tenant"}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={handleInvite} className="form-panel">
          <label className="field">
            <span className="field-label">Business name</span>
            <input className="input" name="name" required />
          </label>
          <label className="field">
            <span className="field-label">Slug (lowercase, hyphens)</span>
            <input className="input" name="slug" required pattern="[a-z0-9-]+" />
          </label>
          <label className="field">
            <span className="field-label">Email to invite</span>
            <input className="input" name="email" type="email" required />
          </label>
          <button type="submit" className="btn btn-primary">
            Send invite
          </button>
        </form>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <DataTable
        value={rows}
        loading={loading}
        emptyMessage="No tenants yet."
        sortMode="multiple"
        removableSort
        stripedRows
        size="small"
        className="mt-3"
      >
        <Column
          field="name"
          header="Name"
          sortable
          body={(row: TenantRow) => <Link to={`/admin/tenants/${row.id}`}>{row.name}</Link>}
        />
        <Column field="slug" header="Slug" sortable />
        <Column field="status" header="Status" sortable />
        <Column
          header={headerWithTip("Kids", "Total kids on this tenant's account.")}
          body={(row: TenantRow) => row.health?.totalKids ?? "—"}
          sortable
          sortFunction={(e) => [...e.data].sort((a: TenantRow, b: TenantRow) => ((a.health?.totalKids ?? -1) - (b.health?.totalKids ?? -1)) * (e.order ?? 1))}
        />
        <Column
          header={headerWithTip("No goals", "Kids with no goals set up at all -- onboarded but never started.")}
          body={(row: TenantRow) => row.health?.kidsWithNoGoals ?? "—"}
        />
        <Column
          header={headerWithTip(
            "No activity (30d+)",
            "Kids with no evidence logged in the last 30 days -- includes kids with no goals, since they trivially have no recent activity either."
          )}
          body={(row: TenantRow) => row.health?.kidsWithNoRecentActivity ?? "—"}
        />
        <Column
          body={(row: Tenant) => (
            <Button
              label={row.status === "ACTIVE" ? "Suspend" : "Reactivate"}
              className="p-button-sm p-button-outlined"
              onClick={() => toggleStatus(row)}
            />
          )}
        />
      </DataTable>

      {pendingInvitations.length > 0 ? (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Pending invitations</h2>
          <DataTable value={pendingInvitations} size="small" stripedRows>
            <Column field="name" header="Name" />
            <Column field="slug" header="Slug" />
            <Column field="email" header="Email" />
            <Column header="Status" body={(inv: TenantInvitation) => STATUS_LABEL[inv.status]} />
            <Column
              body={(inv: TenantInvitation) => (
                <Button label="Revoke" className="p-button-sm p-button-outlined p-button-danger" onClick={() => handleRevoke(inv.id)} />
              )}
            />
          </DataTable>
        </>
      ) : null}
    </div>
  );
}
