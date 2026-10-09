import type { Tenant } from "../api/types";

// Shared by TenantDetailPage (superadmin, also edits KYC) and TenantProfilePage (tenant admin
// self-service, KYC is read-only there -- see backend's updateOwnTenantProfileSchema split).

export type BusinessFormState = {
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
};

export const EMPTY_BUSINESS_FORM: BusinessFormState = {
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
  logoUrl: ""
};

export function businessFieldsFromTenant(tenant: Tenant): BusinessFormState {
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
    logoUrl: tenant.logoUrl ?? ""
  };
}

export function businessFieldsToUpdateInput(form: BusinessFormState) {
  const socialLinks: Record<string, string> = {};
  if (form.instagram) socialLinks.instagram = form.instagram;
  if (form.facebook) socialLinks.facebook = form.facebook;
  if (form.linkedin) socialLinks.linkedin = form.linkedin;
  if (form.youtube) socialLinks.youtube = form.youtube;

  return {
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
    logoUrl: form.logoUrl || undefined
  };
}

export function TenantBusinessFieldsSection({
  form,
  onChange
}: {
  form: BusinessFormState;
  onChange: <K extends keyof BusinessFormState>(key: K, value: BusinessFormState[K]) => void;
}) {
  return (
    <>
      <fieldset className="form-group">
        <legend>Lead owner</legend>
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={form.leadOwnerName} onChange={(e) => onChange("leadOwnerName", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input className="input" type="email" value={form.leadOwnerEmail} onChange={(e) => onChange("leadOwnerEmail", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Phone</span>
          <input className="input" value={form.leadOwnerPhone} onChange={(e) => onChange("leadOwnerPhone", e.target.value)} />
        </label>
      </fieldset>

      <fieldset className="form-group">
        <legend>Address</legend>
        <label className="field">
          <span className="field-label">Address line 1</span>
          <input className="input" value={form.addressLine1} onChange={(e) => onChange("addressLine1", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Address line 2</span>
          <input className="input" value={form.addressLine2} onChange={(e) => onChange("addressLine2", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">City</span>
          <input className="input" value={form.city} onChange={(e) => onChange("city", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">State</span>
          <input className="input" value={form.state} onChange={(e) => onChange("state", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Country</span>
          <input className="input" value={form.country} onChange={(e) => onChange("country", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Pincode</span>
          <input className="input" value={form.pincode} onChange={(e) => onChange("pincode", e.target.value)} />
        </label>
      </fieldset>

      <fieldset className="form-group">
        <legend>Contact &amp; web</legend>
        <label className="field">
          <span className="field-label">Contact phone</span>
          <input className="input" value={form.phone} onChange={(e) => onChange("phone", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Website</span>
          <input className="input" type="url" placeholder="https://..." value={form.website} onChange={(e) => onChange("website", e.target.value)} />
        </label>
      </fieldset>

      <fieldset className="form-group">
        <legend>Social media</legend>
        <label className="field">
          <span className="field-label">Instagram</span>
          <input
            className="input"
            type="url"
            placeholder="https://instagram.com/..."
            value={form.instagram}
            onChange={(e) => onChange("instagram", e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Facebook</span>
          <input
            className="input"
            type="url"
            placeholder="https://facebook.com/..."
            value={form.facebook}
            onChange={(e) => onChange("facebook", e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">LinkedIn</span>
          <input
            className="input"
            type="url"
            placeholder="https://linkedin.com/..."
            value={form.linkedin}
            onChange={(e) => onChange("linkedin", e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">YouTube</span>
          <input
            className="input"
            type="url"
            placeholder="https://youtube.com/..."
            value={form.youtube}
            onChange={(e) => onChange("youtube", e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset className="form-group">
        <legend>Logo</legend>
        <label className="field">
          <span className="field-label">Logo URL</span>
          <input className="input" type="url" placeholder="https://..." value={form.logoUrl} onChange={(e) => onChange("logoUrl", e.target.value)} />
        </label>
        {form.logoUrl ? <img src={form.logoUrl} alt="Tenant logo preview" style={{ maxHeight: 60, marginTop: "0.5rem" }} /> : null}
      </fieldset>
    </>
  );
}
