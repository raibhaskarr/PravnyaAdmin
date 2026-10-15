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

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { token } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [health, setHealth] = useState<TenantHealth | null>(null);
  const [businessForm, setBusinessForm] = useState<BusinessFormState>(EMPTY_BUSINESS_FORM);
  const [kycForm, setKycForm] = useState<KycFormState>({ kycStatus: "PENDING", kycNotes: "" });
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState("");
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingKyc, setSavingKyc] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [saved, setSaved] = useState<"business" | "kyc" | null>(null);

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
    setSaved(null);
  }

  async function handleSaveBusiness() {
    if (!tenantId) return;
    setError("");
    setSavingBusiness(true);
    try {
      const updated = await api.updateTenantProfile(token!, tenantId, businessFieldsToUpdateInput(businessForm));
      setTenant(updated);
      setBusinessForm(businessFieldsFromTenant(updated));
      setSaved("business");
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
      setSaved("kyc");
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
            <dl style={{ margin: 0 }}>
              <div style={{ marginBottom: "0.6rem" }}>
                <span className="field-label">Slug</span>
                <p style={{ margin: "0.1rem 0 0" }}>{tenant.slug}</p>
              </div>
              <div style={{ marginBottom: "0.6rem" }}>
                <span className="field-label">Created</span>
                <p style={{ margin: "0.1rem 0 0" }}>{new Date(tenant.createdAt).toLocaleString()}</p>
              </div>
              <div style={{ marginBottom: "0.6rem" }}>
                <span className="field-label">Kids / no goals / no activity (30d+)</span>
                <p style={{ margin: "0.1rem 0 0" }}>
                  {health ? `${health.totalKids} / ${health.kidsWithNoGoals} / ${health.kidsWithNoRecentActivity}` : "—"}
                </p>
              </div>
            </dl>
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
          <div className="form-panel" style={{ maxWidth: 560 }}>
            <TenantBusinessFieldsSection form={businessForm} onChange={setBusinessField} />
            {saved === "business" ? <p className="hint-text">Saved.</p> : null}
            <Button label={savingBusiness ? "Saving..." : "Save"} className="p-button-sm" onClick={handleSaveBusiness} disabled={savingBusiness} />
          </div>
        </TabPanel>

        <TabPanel header="KYC">
          <div className="form-panel" style={{ maxWidth: 480 }}>
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
                <Tag value={kycForm.kycStatus} severity={KYC_SEVERITY[kycForm.kycStatus]} style={{ marginTop: "0.4rem" }} />
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
              {tenant.kycReviewedAt ? <p className="hint-text">Last reviewed: {new Date(tenant.kycReviewedAt).toLocaleString()}</p> : null}
            </fieldset>
            {saved === "kyc" ? <p className="hint-text">Saved.</p> : null}
            <Button label={savingKyc ? "Saving..." : "Save"} className="p-button-sm" onClick={handleSaveKyc} disabled={savingKyc} />
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
