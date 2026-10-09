import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Tenant } from "../../api/types";
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

/** Self-service business profile for a tenant admin -- same fields as the superadmin's
 * TenantDetailPage, minus KYC editing (that's a Pravnya-side decision, shown read-only here). */
export function TenantProfilePage() {
  const { token } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState<BusinessFormState>(EMPTY_BUSINESS_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    api.getOwnTenantProfile(token!).then((t) => {
      setTenant(t);
      setForm(businessFieldsFromTenant(t));
    });
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

      <div className="form-panel" style={{ maxWidth: 560 }}>
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
    </div>
  );
}
