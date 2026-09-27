import { CSSProperties, FormEvent, useEffect, useState } from "react";
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
        <div style={{ background: "#eef", padding: "1rem", marginBottom: "1rem" }}>
          <p>
            Tenant admin created: <strong>{createdCreds.email}</strong>
          </p>
          <p>
            Temporary password (shown once): <code>{createdCreds.tempPassword}</code>
          </p>
          <button type="button" onClick={() => setCreatedCreds(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <button type="button" onClick={() => setShowForm((v) => !v)}>
        {showForm ? "Cancel" : "New tenant"}
      </button>

      {showForm ? (
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 360, marginTop: "1rem" }}>
          <label>
            Tenant name
            <input name="name" required style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            Slug (lowercase, hyphens)
            <input name="slug" required pattern="[a-z0-9-]+" style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            First admin email
            <input name="adminEmail" type="email" required style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            First admin name
            <input name="adminName" required style={{ display: "block", width: "100%" }} />
          </label>
          <button type="submit">Create tenant</button>
        </form>
      ) : null}

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ marginTop: "1.5rem", borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Slug</th>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td style={cellStyle}>{t.name}</td>
                <td style={cellStyle}>{t.slug}</td>
                <td style={cellStyle}>{t.status}</td>
                <td style={cellStyle}>
                  <button type="button" onClick={() => toggleStatus(t)}>
                    {t.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const cellStyle: CSSProperties = { border: "1px solid #ddd", padding: "0.5rem", textAlign: "left" };
