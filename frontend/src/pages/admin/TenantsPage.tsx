import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Tenant, TenantInvitation } from "../../api/types";

const STATUS_LABEL: Record<TenantInvitation["status"], string> = {
  PENDING: "Invited — waiting to set up",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  REVOKED: "Revoked"
};

export function TenantsPage() {
  const { token } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devSignupUrl, setDevSignupUrl] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([api.listTenants(token!), api.listTenantInvitations(token!)])
      .then(([t, inv]) => {
        setTenants(t);
        setInvitations(inv);
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
              Dev only -- signup link: <code>{devSignupUrl}</code>
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

      {loading ? (
        <p className="empty-state">Loading...</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/admin/tenants/${t.id}`}>{t.name}</Link>
                  </td>
                  <td>{t.slug}</td>
                  <td>{t.status}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => toggleStatus(t)}>
                      {t.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tenants.length === 0 ? <p className="empty-state">No tenants yet.</p> : null}
        </div>
      )}

      {pendingInvitations.length > 0 ? (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Pending invitations</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingInvitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.name}</td>
                    <td>{inv.slug}</td>
                    <td>{inv.email}</td>
                    <td>{STATUS_LABEL[inv.status]}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleRevoke(inv.id)}
                        style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
