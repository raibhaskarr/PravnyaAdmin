import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Tenant, TenantKycStatus } from "../../api/types";
import {
  businessFieldsFromTenant,
  businessFieldsToUpdateInput,
  EMPTY_BUSINESS_FORM,
  TenantBusinessFieldsSection,
  type BusinessFormState
} from "../../components/TenantBusinessFields";

type FormState = BusinessFormState & { kycStatus: TenantKycStatus; kycNotes: string };

const EMPTY_FORM: FormState = { ...EMPTY_BUSINESS_FORM, kycStatus: "PENDING", kycNotes: "" };

function toFormState(tenant: Tenant): FormState {
  return { ...businessFieldsFromTenant(tenant), kycStatus: tenant.kycStatus, kycNotes: tenant.kycNotes ?? "" };
}

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { token } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    if (!tenantId) return;
    api.getTenant(token!, tenantId).then((t) => {
      setTenant(t);
      setForm(toFormState(t));
    });
  }

  useEffect(load, [token, tenantId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    if (!tenantId) return;
    setError("");
    setSaving(true);
    try {
      const updated = await api.updateTenantProfile(token!, tenantId, {
        ...businessFieldsToUpdateInput(form),
        kycStatus: form.kycStatus,
        kycNotes: form.kycNotes || undefined
      });
      setTenant(updated);
      setForm(toFormState(updated));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save tenant profile");
    } finally {
      setSaving(false);
    }
  }

  if (!tenantId) return null;
  if (!tenant) return <p className="empty-state">Loading...</p>;

  return (
    <div>
      <Link to="/admin/tenants" className="hint-text" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
        ← Back to Tenants
      </Link>
      <h1>
        {tenant.name} <span className="hint-text" style={{ fontWeight: 400, fontSize: "0.9rem" }}>{tenant.status}</span>
      </h1>

      <div className="form-panel" style={{ maxWidth: 560 }}>
        <TenantBusinessFieldsSection form={form} onChange={set} />

        <fieldset className="form-group">
          <legend>KYC</legend>
          <label className="field">
            <span className="field-label">Status</span>
            <select className="input" value={form.kycStatus} onChange={(e) => set("kycStatus", e.target.value as TenantKycStatus)}>
              <option value="PENDING">Pending</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea className="input" rows={3} value={form.kycNotes} onChange={(e) => set("kycNotes", e.target.value)} />
          </label>
          {tenant.kycReviewedAt ? (
            <p className="hint-text">Last reviewed: {new Date(tenant.kycReviewedAt).toLocaleString()}</p>
          ) : null}
        </fieldset>

        {error ? <p className="error-text">{error}</p> : null}
        {saved ? <p className="hint-text">Saved.</p> : null}

        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
