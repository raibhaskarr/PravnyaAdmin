import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Tenant } from "../../api/types";

export function TenantsPage() {
  const { token } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; tempPassword: string } | null>(null);

  function load() {
    setLoading(true);
    api
      .listTenants(token!)
      .then(setTenants)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load tenants"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const result = await api.createTenant(token!, {
        name: String(form.get("name")),
        slug: String(form.get("slug")),
        adminEmail: String(form.get("adminEmail")),
        adminName: String(form.get("adminName"))
      });
      setCreatedCreds({ email: result.adminEmail, tempPassword: result.tempPassword });
      setShowForm(false);
      event.currentTarget.reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create tenant");
    }
  }

  async function toggleStatus(tenant: Tenant) {
    await api.updateTenant(token!, tenant.id, { status: tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" });
    load();
  }

  return (
    <div>
      <h1>Tenants</h1>

      {createdCreds ? (
        <div className="callout">
          <p>
            Tenant admin created: <strong>{createdCreds.email}</strong>
          </p>
          <p>
            Temporary password (shown once): <code>{createdCreds.tempPassword}</code>
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setCreatedCreds(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="page-toolbar">
        <button type="button" className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New tenant"}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={handleCreate} className="form-panel">
          <label className="field">
            <span className="field-label">Tenant name</span>
            <input className="input" name="name" required />
          </label>
          <label className="field">
            <span className="field-label">Slug (lowercase, hyphens)</span>
            <input className="input" name="slug" required pattern="[a-z0-9-]+" />
          </label>
          <label className="field">
            <span className="field-label">First admin email</span>
            <input className="input" name="adminEmail" type="email" required />
          </label>
          <label className="field">
            <span className="field-label">First admin name</span>
            <input className="input" name="adminName" required />
          </label>
          <button type="submit" className="btn btn-primary">
            Create tenant
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
                  <td>{t.name}</td>
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
    </div>
  );
}
