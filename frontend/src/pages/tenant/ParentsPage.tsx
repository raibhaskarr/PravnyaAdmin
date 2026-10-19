import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Checkbox } from "primereact/checkbox";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { ParentSummary, Therapist } from "../../api/types";
import { formatParentName } from "../../utils/parent";

const EMPTY_FORM = {
  parentEmail: "",
  parentMobile: "",
  fatherName: "",
  motherName: "",
  addressLine1: "",
  city: "",
  firstName: "",
  lastName: ""
};

type FormState = typeof EMPTY_FORM;

/** The primary onboarding entry point: a parent (household) and its first kid are created
 * together (see docs/manual/06-parent-kid-onboarding-spec.md -- a parent record is never created
 * with zero kids, so "which parents can I see" stays exactly "which kids can I see", one level
 * up). Adding a further kid to an existing parent happens from ParentDetailPage, not here. */
export function ParentsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [parents, setParents] = useState<ParentSummary[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    setLoading(true);
    Promise.all([api.listParents(token!), api.listTherapists(token!)])
      .then(([p, t]) => {
        setParents(p);
        setTherapists(t);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openDialog() {
    setForm(EMPTY_FORM);
    setSelectedTherapistIds(new Set());
    setError("");
    setDialogOpen(true);
  }

  function toggleTherapist(therapistId: string) {
    setSelectedTherapistIds((prev) => {
      const next = new Set(prev);
      if (next.has(therapistId)) next.delete(therapistId);
      else next.add(therapistId);
      return next;
    });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.createKid(token!, {
        firstName: form.firstName,
        lastName: form.lastName,
        therapistIds: [...selectedTherapistIds],
        parentEmail: form.parentEmail,
        parentMobile: form.parentMobile,
        fatherName: form.fatherName || undefined,
        motherName: form.motherName || undefined,
        addressLine1: form.addressLine1 || undefined,
        city: form.city || undefined
      });
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create parent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Parents</h1>

      {canEdit ? (
        <div className="page-toolbar">
          <Button label="New parent" icon="pi pi-plus" className="p-button-sm" onClick={openDialog} />
        </div>
      ) : null}

      <DataTable
        value={parents}
        loading={loading}
        emptyMessage="No parents yet."
        sortMode="multiple"
        removableSort
        stripedRows
        size="small"
        className="mt-3"
        onRowClick={(e) => navigate(`/tenant/parents/${(e.data as ParentSummary).id}`)}
        rowClassName={() => "clickable-row"}
      >
        <Column header="Parent" sortable sortField="fatherName" body={(p: ParentSummary) => formatParentName(p)} />
        <Column field="email" header="Email" sortable />
        <Column field="mobile" header="Mobile" />
        <Column field="city" header="City" sortable body={(p: ParentSummary) => p.city ?? "—"} />
        <Column header="Kids" sortable sortField="kidCount" body={(p: ParentSummary) => p.kidCount} />
      </DataTable>

      <Dialog
        header="New parent"
        visible={dialogOpen}
        onHide={() => setDialogOpen(false)}
        style={{ width: "min(640px, 94vw)" }}
        modal
      >
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <fieldset className="form-group">
            <legend>Parent</legend>
            <div className="field-grid">
              <label className="field">
                <span className="field-label">Email</span>
                <InputText value={form.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} type="email" required />
              </label>
              <label className="field">
                <span className="field-label">Mobile</span>
                <InputText value={form.parentMobile} onChange={(e) => set("parentMobile", e.target.value)} type="tel" required />
              </label>
              <label className="field">
                <span className="field-label">Father's name</span>
                <InputText value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Mother's name</span>
                <InputText value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Address</span>
                <InputText value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">City</span>
                <InputText value={form.city} onChange={(e) => set("city", e.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-group">
            <legend>First kid</legend>
            <div className="field-grid">
              <label className="field">
                <span className="field-label">First name</span>
                <InputText value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
              </label>
              <label className="field">
                <span className="field-label">Last name</span>
                <InputText value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-group">
            <legend>Assigned therapists</legend>
            {therapists
              .filter((t) => t.status === "ACTIVE")
              .map((t) => (
                <div key={t.id} className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Checkbox inputId={`therapist_${t.id}`} checked={selectedTherapistIds.has(t.id)} onChange={() => toggleTherapist(t.id)} />
                  <label htmlFor={`therapist_${t.id}`}>{t.name}</label>
                </div>
              ))}
            {therapists.filter((t) => t.status === "ACTIVE").length === 0 ? <p className="hint-text">No active therapists yet.</p> : null}
          </fieldset>

          {error ? <p className="error-text">{error}</p> : null}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button label="Cancel" type="button" className="p-button-sm p-button-text" onClick={() => setDialogOpen(false)} disabled={saving} />
            <Button label={saving ? "Creating..." : "Create parent"} type="submit" className="p-button-sm" disabled={saving} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
