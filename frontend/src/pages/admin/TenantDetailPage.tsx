import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TabView, TabPanel } from "primereact/tabview";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { AuditLogEntry, Tenant, TenantHealth, TenantKycStatus } from "../../api/types";
import {
  businessFieldsFromTenant,
  businessFieldsToUpdateInput,
  EMPTY_BUSINESS_FORM,
  TenantBusinessFieldsSection,
  type BusinessFormState
} from "../../components/TenantBusinessFields";

const ACTION_LABEL: Record<string, string> = {
  TENANT_STATUS_CHANGED: "Status changed",
  TENANT_KYC_STATUS_CHANGED: "KYC status changed"
};

function auditLabel(entry: AuditLogEntry): string {
  const label = ACTION_LABEL[entry.action] ?? entry.action;
  if (entry.fromValue && entry.toValue) return `${label}: ${entry.fromValue} → ${entry.toValue}`;
  if (entry.toValue) return `${label}: ${entry.toValue}`;
  return label;
}

const KYC_SEVERITY: Record<TenantKycStatus, "success" | "warning" | "danger"> = {
  VERIFIED: "success",
  PENDING: "warning",
  REJECTED: "danger"
};

type KycFormState = { kycStatus: TenantKycStatus; kycNotes: string };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <span className="field-label">{label}</span>
      <p style={{ margin: "0.1rem 0 0" }}>{value || <span className="hint-text">—</span>}</p>
    </div>
  );
}

function LinkField({ label, href }: { label: string; href: string }) {
  return <Field label={label} value={href ? <a href={href} target="_blank" rel="noreferrer">{href}</a> : null} />;
}

/** Read-only view of everything TenantBusinessFieldsSection can edit -- grouped the same way, so
 * switching between this and the edit form (Edit button) doesn't reshuffle where anything is. */
function BusinessProfileReadOnly({ form }: { form: BusinessFormState }) {
  return (
    <>
      <fieldset className="form-group">
        <legend>Lead owner</legend>
        <div className="field-grid">
          <Field label="Name" value={form.leadOwnerName} />
          <Field label="Email" value={form.leadOwnerEmail} />
          <Field label="Phone" value={form.leadOwnerPhone} />
        </div>
      </fieldset>
      <fieldset className="form-group">
        <legend>Address</legend>
        <div className="field-grid">
          <Field label="Address line 1" value={form.addressLine1} />
          <Field label="Address line 2" value={form.addressLine2} />
          <Field label="City" value={form.city} />
          <Field label="State" value={form.state} />
          <Field label="Country" value={form.country} />
          <Field label="Pincode" value={form.pincode} />
        </div>
      </fieldset>
      <fieldset className="form-group">
        <legend>Contact &amp; web</legend>
        <div className="field-grid">
          <Field label="Contact phone" value={form.phone} />
          <LinkField label="Website" href={form.website} />
        </div>
      </fieldset>
      <fieldset className="form-group">
        <legend>Social media</legend>
        <div className="field-grid">
          <LinkField label="Instagram" href={form.instagram} />
          <LinkField label="Facebook" href={form.facebook} />
          <LinkField label="LinkedIn" href={form.linkedin} />
          <LinkField label="YouTube" href={form.youtube} />
        </div>
      </fieldset>
      <fieldset className="form-group">
        <legend>Logo</legend>
        {form.logoUrl ? <img src={form.logoUrl} alt="Tenant logo" style={{ maxHeight: 60 }} /> : <p className="hint-text">—</p>}
      </fieldset>
    </>
  );
}

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { token } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [health, setHealth] = useState<TenantHealth | null>(null);
  const [businessForm, setBusinessForm] = useState<BusinessFormState>(EMPTY_BUSINESS_FORM);
  const [kycForm, setKycForm] = useState<KycFormState>({ kycStatus: "PENDING", kycNotes: "" });
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState("");
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [editingKyc, setEditingKyc] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingKyc, setSavingKyc] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  function load() {
    if (!tenantId) return;
    api.getTenant(token!, tenantId).then((t) => {
      setTenant(t);
      setBusinessForm(businessFieldsFromTenant(t));
      setKycForm({ kycStatus: t.kycStatus, kycNotes: t.kycNotes ?? "" });
    });
    api.listTenantAuditLog(token!, tenantId).then(setAuditLog);
    api.listTenantHealth(token!).then((rows) => setHealth(rows.find((r) => r.tenantId === tenantId) ?? null));
  }

  useEffect(load, [token, tenantId]);

  function setBusinessField<K extends keyof BusinessFormState>(key: K, value: BusinessFormState[K]) {
    setBusinessForm((prev) => ({ ...prev, [key]: value }));
  }

  function cancelEditBusiness() {
    if (tenant) setBusinessForm(businessFieldsFromTenant(tenant));
    setEditingBusiness(false);
  }

  function cancelEditKyc() {
    if (tenant) setKycForm({ kycStatus: tenant.kycStatus, kycNotes: tenant.kycNotes ?? "" });
    setEditingKyc(false);
  }

  async function handleSaveBusiness() {
    if (!tenantId) return;
    setError("");
    setSavingBusiness(true);
    try {
      const updated = await api.updateTenantProfile(token!, tenantId, businessFieldsToUpdateInput(businessForm));
      setTenant(updated);
      setBusinessForm(businessFieldsFromTenant(updated));
      setEditingBusiness(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save business profile");
    } finally {
      setSavingBusiness(false);
    }
  }

  async function handleSaveKyc() {
    if (!tenantId) return;
    setError("");
    setSavingKyc(true);
    try {
      const updated = await api.updateTenantProfile(token!, tenantId, { kycStatus: kycForm.kycStatus, kycNotes: kycForm.kycNotes || undefined });
      setTenant(updated);
      setKycForm({ kycStatus: updated.kycStatus, kycNotes: updated.kycNotes ?? "" });
      setEditingKyc(false);
      api.listTenantAuditLog(token!, tenantId).then(setAuditLog);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save KYC status");
    } finally {
      setSavingKyc(false);
    }
  }

  async function toggleStatus() {
    if (!tenantId || !tenant) return;
    setSavingStatus(true);
    try {
      const updated = await api.updateTenant(token!, tenantId, { status: tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" });
      setTenant(updated);
      api.listTenantAuditLog(token!, tenantId).then(setAuditLog);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change status");
    } finally {
      setSavingStatus(false);
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
        {tenant.name}{" "}
        <Tag value={tenant.status} severity={tenant.status === "ACTIVE" ? "success" : "danger"} style={{ verticalAlign: "middle", fontSize: "0.7rem" }} />
      </h1>

      {error ? <p className="error-text">{error}</p> : null}

      <TabView>
        <TabPanel header="Overview">
          <div className="form-panel" style={{ maxWidth: 480 }}>
            <Field label="Slug" value={tenant.slug} />
            <Field label="Created" value={new Date(tenant.createdAt).toLocaleString()} />
            <Field
              label="Kids / no goals / no activity (30d+)"
              value={health ? `${health.totalKids} / ${health.kidsWithNoGoals} / ${health.kidsWithNoRecentActivity}` : null}
            />
            <Button
              label={tenant.status === "ACTIVE" ? "Suspend tenant" : "Reactivate tenant"}
              className={`p-button-sm p-button-outlined ${tenant.status === "ACTIVE" ? "p-button-danger" : ""}`}
              onClick={toggleStatus}
              disabled={savingStatus}
              style={{ marginTop: "0.5rem" }}
            />
          </div>
        </TabPanel>

        <TabPanel header="Business Profile">
          <div className="form-panel" style={{ maxWidth: 820 }}>
            {editingBusiness ? (
              <>
                <TenantBusinessFieldsSection form={businessForm} onChange={setBusinessField} />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button label={savingBusiness ? "Saving..." : "Save"} className="p-button-sm" onClick={handleSaveBusiness} disabled={savingBusiness} />
                  <Button label="Cancel" className="p-button-sm p-button-text" onClick={cancelEditBusiness} disabled={savingBusiness} />
                </div>
              </>
            ) : (
              <>
                <BusinessProfileReadOnly form={businessForm} />
                <Button label="Edit" icon="pi pi-pencil" className="p-button-sm p-button-outlined" onClick={() => setEditingBusiness(true)} />
              </>
            )}
          </div>
        </TabPanel>

        <TabPanel header="KYC">
          <div className="form-panel" style={{ maxWidth: 480 }}>
            {editingKyc ? (
              <>
                <fieldset className="form-group">
                  <legend>KYC</legend>
                  <label className="field">
                    <span className="field-label">Status</span>
                    <select
                      className="input"
                      value={kycForm.kycStatus}
                      onChange={(e) => setKycForm((prev) => ({ ...prev, kycStatus: e.target.value as TenantKycStatus }))}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="VERIFIED">Verified</option>
                      <option value="REJECTED">Rejected</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Notes</span>
                    <textarea
                      className="input"
                      rows={3}
                      value={kycForm.kycNotes}
                      onChange={(e) => setKycForm((prev) => ({ ...prev, kycNotes: e.target.value }))}
                    />
                  </label>
                </fieldset>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button label={savingKyc ? "Saving..." : "Save"} className="p-button-sm" onClick={handleSaveKyc} disabled={savingKyc} />
                  <Button label="Cancel" className="p-button-sm p-button-text" onClick={cancelEditKyc} disabled={savingKyc} />
                </div>
              </>
            ) : (
              <>
                <fieldset className="form-group">
                  <legend>KYC</legend>
                  <div style={{ marginBottom: "0.6rem" }}>
                    <span className="field-label">Status</span>
                    <p style={{ margin: "0.2rem 0 0" }}>
                      <Tag value={kycForm.kycStatus} severity={KYC_SEVERITY[kycForm.kycStatus]} />
                    </p>
                  </div>
                  <Field label="Notes" value={kycForm.kycNotes} />
                  {tenant.kycReviewedAt ? <p className="hint-text">Last reviewed: {new Date(tenant.kycReviewedAt).toLocaleString()}</p> : null}
                </fieldset>
                <Button label="Edit" icon="pi pi-pencil" className="p-button-sm p-button-outlined" onClick={() => setEditingKyc(true)} />
              </>
            )}
          </div>
        </TabPanel>

        <TabPanel header="Activity">
          <DataTable value={auditLog} size="small" stripedRows emptyMessage="No status or KYC changes recorded for this tenant yet.">
            <Column header="When" body={(entry: AuditLogEntry) => new Date(entry.createdAt).toLocaleString()} />
            <Column field="actorEmail" header="Who" />
            <Column header="What changed" body={(entry: AuditLogEntry) => auditLabel(entry)} />
          </DataTable>
        </TabPanel>
      </TabView>
    </div>
  );
}
