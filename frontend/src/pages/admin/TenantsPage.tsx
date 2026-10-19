import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
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

const EMPTY_FORM = { name: "", slug: "", email: "" };
type FormState = typeof EMPTY_FORM;

export function TenantsPage() {
  const { token } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [health, setHealth] = useState<Record<string, TenantHealth>>({});
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [inviteError, setInviteError] = useState("");
  const [saving, setSaving] = useState(false);
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

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openDialog() {
    setForm(EMPTY_FORM);
    setInviteError("");
    setDialogOpen(true);
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError("");
    setSaving(true);
    try {
      const result = await api.inviteTenant(token!, { name: form.name, slug: form.slug, email: form.email });
      setSentTo(result.invitation.email);
      setDevSignupUrl(result.signupUrl ?? null);
      setDialogOpen(false);
      load();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to send invitation");
    } finally {
      setSaving(false);
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
          <Button label="Dismiss" className="p-button-sm p-button-text" onClick={() => setSentTo(null)} />
        </div>
      ) : null}

      <div className="page-toolbar">
        <Button label="Invite a tenant" icon="pi pi-plus" className="p-button-sm" onClick={openDialog} />
      </div>

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

      <Dialog header="Invite a tenant" visible={dialogOpen} onHide={() => setDialogOpen(false)} style={{ width: "min(480px, 94vw)" }} modal>
        <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <label className="field">
            <span className="field-label">Business name</span>
            <InputText value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Slug (lowercase, hyphens)</span>
            <InputText value={form.slug} onChange={(e) => set("slug", e.target.value)} required pattern="[a-z0-9-]+" />
          </label>
          <label className="field">
            <span className="field-label">Email to invite</span>
            <InputText value={form.email} onChange={(e) => set("email", e.target.value)} type="email" required />
          </label>

          {inviteError ? <p className="error-text">{inviteError}</p> : null}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button label="Cancel" type="button" className="p-button-sm p-button-text" onClick={() => setDialogOpen(false)} disabled={saving} />
            <Button label={saving ? "Sending..." : "Send invite"} type="submit" className="p-button-sm" disabled={saving} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
