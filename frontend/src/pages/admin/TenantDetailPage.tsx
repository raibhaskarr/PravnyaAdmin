import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Tenant, TenantKycStatus } from "../../api/types";

type FormState = {
  leadOwnerName: string;
  leadOwnerEmail: string;
  leadOwnerPhone: string;
  phone: string;
  website: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  youtube: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  logoUrl: string;
  kycStatus: TenantKycStatus;
  kycNotes: string;
};

const EMPTY_FORM: FormState = {
  leadOwnerName: "",
  leadOwnerEmail: "",
  leadOwnerPhone: "",
  phone: "",
  website: "",
  instagram: "",
  facebook: "",
  linkedin: "",
  youtube: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "",
  pincode: "",
  logoUrl: "",
  kycStatus: "PENDING",
  kycNotes: ""
};

function toFormState(tenant: Tenant): FormState {
  const social = tenant.socialLinks ?? {};
  return {
    leadOwnerName: tenant.leadOwnerName ?? "",
    leadOwnerEmail: tenant.leadOwnerEmail ?? "",
    leadOwnerPhone: tenant.leadOwnerPhone ?? "",
    phone: tenant.phone ?? "",
    website: tenant.website ?? "",
    instagram: social.instagram ?? "",
    facebook: social.facebook ?? "",
    linkedin: social.linkedin ?? "",
    youtube: social.youtube ?? "",
    addressLine1: tenant.addressLine1 ?? "",
    addressLine2: tenant.addressLine2 ?? "",
    city: tenant.city ?? "",
    state: tenant.state ?? "",
    country: tenant.country ?? "",
    pincode: tenant.pincode ?? "",
    logoUrl: tenant.logoUrl ?? "",
    kycStatus: tenant.kycStatus,
    kycNotes: tenant.kycNotes ?? ""
  };
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
      const socialLinks: Record<string, string> = {};
      if (form.instagram) socialLinks.instagram = form.instagram;
      if (form.facebook) socialLinks.facebook = form.facebook;
      if (form.linkedin) socialLinks.linkedin = form.linkedin;
      if (form.youtube) socialLinks.youtube = form.youtube;

      const updated = await api.updateTenantProfile(token!, tenantId, {
        leadOwnerName: form.leadOwnerName || undefined,
        leadOwnerEmail: form.leadOwnerEmail || undefined,
        leadOwnerPhone: form.leadOwnerPhone || undefined,
        phone: form.phone || undefined,
        website: form.website || undefined,
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
        addressLine1: form.addressLine1 || undefined,
        addressLine2: form.addressLine2 || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        country: form.country || undefined,
        pincode: form.pincode || undefined,
        logoUrl: form.logoUrl || undefined,
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
        <fieldset className="form-group">
          <legend>Lead owner</legend>
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" value={form.leadOwnerName} onChange={(e) => set("leadOwnerName", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input className="input" type="email" value={form.leadOwnerEmail} onChange={(e) => set("leadOwnerEmail", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Phone</span>
            <input className="input" value={form.leadOwnerPhone} onChange={(e) => set("leadOwnerPhone", e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="form-group">
          <legend>Address</legend>
          <label className="field">
            <span className="field-label">Address line 1</span>
            <input className="input" value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Address line 2</span>
            <input className="input" value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">City</span>
            <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">State</span>
            <input className="input" value={form.state} onChange={(e) => set("state", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Country</span>
            <input className="input" value={form.country} onChange={(e) => set("country", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Pincode</span>
            <input className="input" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="form-group">
          <legend>Contact &amp; web</legend>
          <label className="field">
            <span className="field-label">Contact phone</span>
            <input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Website</span>
            <input className="input" type="url" placeholder="https://..." value={form.website} onChange={(e) => set("website", e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="form-group">
          <legend>Social media</legend>
          <label className="field">
            <span className="field-label">Instagram</span>
            <input className="input" type="url" placeholder="https://instagram.com/..." value={form.instagram} onChange={(e) => set("instagram", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Facebook</span>
            <input className="input" type="url" placeholder="https://facebook.com/..." value={form.facebook} onChange={(e) => set("facebook", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">LinkedIn</span>
            <input className="input" type="url" placeholder="https://linkedin.com/..." value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">YouTube</span>
            <input className="input" type="url" placeholder="https://youtube.com/..." value={form.youtube} onChange={(e) => set("youtube", e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="form-group">
          <legend>Logo</legend>
          <label className="field">
            <span className="field-label">Logo URL</span>
            <input className="input" type="url" placeholder="https://..." value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} />
          </label>
          {form.logoUrl ? <img src={form.logoUrl} alt="Tenant logo preview" style={{ maxHeight: 60, marginTop: "0.5rem" }} /> : null}
        </fieldset>

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
