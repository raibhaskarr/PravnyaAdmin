import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, Therapist } from "../../api/types";
import { formatParentName } from "../../utils/parent";

const EMPTY_FORM = { firstName: "", lastName: "", gender: "" };
type FormState = typeof EMPTY_FORM;

/** For a brand new parent, use the Parents page -- it captures the parent info and this
 * kid's info together in one step. This form is for a kid with no parent on file yet, or (once
 * supported here) one to be linked to an existing parent by email later. */
export function KidsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [kids, setKids] = useState<Kid[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dob, setDob] = useState<Date | null>(null);
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    setLoading(true);
    Promise.all([api.listKids(token!), api.listTherapists(token!)])
      .then(([k, t]) => {
        setKids(k);
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
    setDob(null);
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
        dob: dob ? dob.toISOString() : undefined,
        gender: form.gender || undefined,
        therapistIds: [...selectedTherapistIds]
      });
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create kid");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Kids</h1>

      {canEdit ? (
        <div className="page-toolbar">
          <Button label="New kid" icon="pi pi-plus" className="p-button-sm" onClick={openDialog} />
        </div>
      ) : null}

      <DataTable
        value={kids}
        loading={loading}
        emptyMessage="No kids visible to your account yet."
        sortMode="multiple"
        removableSort
        stripedRows
        size="small"
        className="mt-3"
        onRowClick={(e) => navigate(`/tenant/kids/${(e.data as Kid).id}`)}
        rowClassName={() => "clickable-row"}
      >
        <Column header="Name" sortable sortField="firstName" body={(k: Kid) => `${k.firstName} ${k.lastName}`} />
        <Column field="status" header="Status" sortable />
        <Column header="Parent" body={(k: Kid) => (k.parent ? formatParentName(k.parent) : "—")} />
        <Column header="Therapists" body={(k: Kid) => k.therapists.map((t) => t.therapist.name).join(", ") || "—"} />
      </DataTable>

      <Dialog header="New kid" visible={dialogOpen} onHide={() => setDialogOpen(false)} style={{ width: "min(560px, 94vw)" }} modal>
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <p className="hint-text" style={{ margin: 0 }}>
            For a brand new parent, use <Link to="/tenant/parents">Parents</Link> instead -- it captures the parent's
            info and this kid together. This form is for a kid with no parent on file.
          </p>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">First name</span>
              <InputText value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
            </label>
            <label className="field">
              <span className="field-label">Last name</span>
              <InputText value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
            </label>
            <label className="field">
              <span className="field-label">Date of birth</span>
              <Calendar value={dob} onChange={(e) => setDob((e.value as Date) ?? null)} dateFormat="dd/mm/yy" showIcon maxDate={new Date()} inputClassName="input" />
            </label>
            <label className="field">
              <span className="field-label">Gender</span>
              <InputText value={form.gender} onChange={(e) => set("gender", e.target.value)} />
            </label>
          </div>

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
          </fieldset>

          {error ? <p className="error-text">{error}</p> : null}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button label="Cancel" type="button" className="p-button-sm p-button-text" onClick={() => setDialogOpen(false)} disabled={saving} />
            <Button label={saving ? "Creating..." : "Create kid"} type="submit" className="p-button-sm" disabled={saving} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
