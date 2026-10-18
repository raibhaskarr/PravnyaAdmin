import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { HouseholdSummary, Therapist } from "../../api/types";
import { formatHouseholdName } from "../../utils/household";

/** The primary onboarding entry point: a household and its first kid are created together (see
 * docs/manual/06-parent-kid-onboarding-spec.md -- a household is never created with zero kids, so
 * "which households can I see" stays exactly "which kids can I see", one level up). Adding a
 * further kid to an existing household happens from HouseholdDetailPage, not here. */
export function HouseholdsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    api.listHouseholds(token!).then(setHouseholds);
    api.listTherapists(token!).then(setTherapists);
  }

  useEffect(load, [token]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setError("");
    setSaving(true);
    const form = new FormData(formEl);
    const therapistIds = therapists.filter((t) => form.get(`therapist_${t.id}`) === "on").map((t) => t.id);
    try {
      await api.createKid(token!, {
        firstName: String(form.get("firstName")),
        lastName: String(form.get("lastName")),
        therapistIds,
        parentEmail: String(form.get("parentEmail")),
        parentMobile: String(form.get("parentMobile")),
        fatherName: String(form.get("fatherName") || "") || undefined,
        motherName: String(form.get("motherName") || "") || undefined,
        addressLine1: String(form.get("addressLine1") || "") || undefined,
        city: String(form.get("city") || "") || undefined
      });
      setShowForm(false);
      formEl.reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create household");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Households</h1>

      {canEdit ? (
        <>
          <div className="page-toolbar">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New household"}
            </button>
          </div>
          {showForm ? (
            <form onSubmit={handleCreate} className="form-panel">
              <fieldset className="form-group">
                <legend>Household</legend>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">Email</span>
                    <input className="input" name="parentEmail" type="email" required />
                  </label>
                  <label className="field">
                    <span className="field-label">Mobile</span>
                    <input className="input" name="parentMobile" type="tel" required />
                  </label>
                  <label className="field">
                    <span className="field-label">Father's name</span>
                    <input className="input" name="fatherName" />
                  </label>
                  <label className="field">
                    <span className="field-label">Mother's name</span>
                    <input className="input" name="motherName" />
                  </label>
                  <label className="field">
                    <span className="field-label">Address</span>
                    <input className="input" name="addressLine1" />
                  </label>
                  <label className="field">
                    <span className="field-label">City</span>
                    <input className="input" name="city" />
                  </label>
                </div>
              </fieldset>
              <fieldset className="form-group">
                <legend>First kid</legend>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">First name</span>
                    <input className="input" name="firstName" required />
                  </label>
                  <label className="field">
                    <span className="field-label">Last name</span>
                    <input className="input" name="lastName" required />
                  </label>
                </div>
              </fieldset>
              <fieldset className="form-group">
                <legend>Assigned therapists</legend>
                {therapists
                  .filter((t) => t.status === "ACTIVE")
                  .map((t) => (
                    <label key={t.id} className="checkbox-row">
                      <input type="checkbox" name={`therapist_${t.id}`} /> {t.name}
                    </label>
                  ))}
              </fieldset>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Creating..." : "Create household"}
              </button>
            </form>
          ) : null}
        </>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <DataTable
        value={households}
        emptyMessage="No households yet."
        sortMode="multiple"
        removableSort
        stripedRows
        size="small"
        onRowClick={(e) => navigate(`/tenant/households/${(e.data as HouseholdSummary).id}`)}
        rowClassName={() => "clickable-row"}
      >
        <Column header="Household" sortable sortField="fatherName" body={(h: HouseholdSummary) => formatHouseholdName(h)} />
        <Column field="email" header="Email" sortable />
        <Column field="mobile" header="Mobile" />
        <Column field="city" header="City" sortable body={(h: HouseholdSummary) => h.city ?? "—"} />
        <Column header="Kids" sortable sortField="kidCount" body={(h: HouseholdSummary) => h.kidCount} />
      </DataTable>
    </div>
  );
}
