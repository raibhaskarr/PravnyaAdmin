import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { AuditLogEntry, Tenant, TenantHealth } from "../../api/types";
import {
  businessFieldsFromTenant,
  businessFieldsToUpdateInput,
  EMPTY_BUSINESS_FORM,
  TenantBusinessFieldsSection,
  type BusinessFormState
} from "../../components/TenantBusinessFields";

const KYC_LABEL: Record<Tenant["kycStatus"], string> = {
  PENDING: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected -- contact us to resolve"
};

const ACTION_LABEL: Record<string, string> = {
  TENANT_STATUS_CHANGED: "Status changed",
  TENANT_KYC_STATUS_CHANGED: "KYC status changed",
  THERAPIST_INVITED: "Therapist invited",
  THERAPIST_INVITATION_REVOKED: "Therapist invitation revoked",
  KID_ADDED: "Kid added"
};

function auditLabel(entry: AuditLogEntry): string {
  const label = ACTION_LABEL[entry.action] ?? entry.action;
  if (entry.fromValue && entry.toValue) return `${label}: ${entry.fromValue} → ${entry.toValue}`;
  if (entry.toValue) return `${label}: ${entry.toValue}`;
  return label;
}

/** Self-service business profile for a tenant admin -- same fields as the superadmin's
 * TenantDetailPage, minus KYC editing (that's a Pravnya-side decision, shown read-only here). */
export function TenantProfilePage() {
  const { token } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [health, setHealth] = useState<TenantHealth | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [form, setForm] = useState<BusinessFormState>(EMPTY_BUSINESS_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    api.getOwnTenantProfile(token!).then((t) => {
      setTenant(t);
      setForm(businessFieldsFromTenant(t));
    });
    api.getOwnTenantHealth(token!).then(setHealth);
    api.listOwnTenantAuditLog(token!).then(setAuditLog);
  }

  useEffect(load, [token]);

  function set<K extends keyof BusinessFormState>(key: K, value: BusinessFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const updated = await api.updateOwnTenantProfile(token!, businessFieldsToUpdateInput(form));
      setTenant(updated);
      setForm(businessFieldsFromTenant(updated));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save your business profile");
    } finally {
      setSaving(false);
    }
  }

  if (!tenant) return <p className="empty-state">Loading...</p>;

  return (
    <div>
      <h1>Business profile</h1>
      <p className="hint-text" style={{ marginBottom: "1.25rem" }}>
        Tell us more about {tenant.name} -- this helps us verify your account and shows up wherever your profile is displayed.
      </p>

      <fieldset className="form-group" style={{ maxWidth: 820, marginBottom: "1.25rem" }}>
        <legend>Centre health</legend>
        {health ? (
          <div className="field-grid">
            <div>
              <span className="field-label">Kids</span>
              <p style={{ margin: "0.1rem 0 0" }}>{health.totalKids}</p>
            </div>
            <div>
              <span className="field-label">No goals yet</span>
              <p style={{ margin: "0.1rem 0 0" }}>{health.kidsWithNoGoals}</p>
            </div>
            <div>
              <span className="field-label">No activity in 30 days</span>
              <p style={{ margin: "0.1rem 0 0" }}>{health.kidsWithNoRecentActivity}</p>
            </div>
          </div>
        ) : (
          <p className="hint-text">Loading...</p>
        )}
      </fieldset>

      <div className="form-panel" style={{ maxWidth: 820 }}>
        <TenantBusinessFieldsSection form={form} onChange={set} />

        <fieldset className="form-group">
          <legend>KYC</legend>
          <p>{KYC_LABEL[tenant.kycStatus]}</p>
          {tenant.kycNotes ? <p className="hint-text">{tenant.kycNotes}</p> : null}
        </fieldset>

        {error ? <p className="error-text">{error}</p> : null}
        {saved ? <p className="hint-text">Saved.</p> : null}

        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Activity</h2>
      <div className="table-wrap" style={{ maxWidth: 820 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.createdAt).toLocaleString()}</td>
                <td>{auditLabel(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {auditLog.length === 0 ? <p className="empty-state">No activity recorded yet.</p> : null}
      </div>
    </div>
  );
}
