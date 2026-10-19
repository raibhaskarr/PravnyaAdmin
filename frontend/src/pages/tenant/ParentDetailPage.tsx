import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, Parent, Therapist } from "../../api/types";
import { formatParentName } from "../../utils/parent";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <span className="field-label">{label}</span>
      <p style={{ margin: "0.1rem 0 0" }}>{value ?? <span className="hint-text">—</span>}</p>
    </div>
  );
}

export function ParentDetailPage() {
  const { parentId } = useParams<{ parentId: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [parent, setParent] = useState<Parent | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState<Date | null>(null);
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    if (!parentId) return;
    api.getParent(token!, parentId).then((data) => {
      setParent(data.parent);
      setKids(data.kids);
    });
    api.listTherapists(token!).then(setTherapists);
  }

  useEffect(load, [token, parentId]);

  function openDialog() {
    setFirstName("");
    setLastName("");
    setGender("");
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

  async function handleAddKid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parent) return;
    setError("");
    setSaving(true);
    try {
      // parentEmail/parentMobile are this same parent's existing values, not re-entered --
      // createKid's find-or-create-by-email reuses the existing Parent row rather than making a
      // new one.
      await api.createKid(token!, {
        firstName,
        lastName,
        dob: dob ? dob.toISOString() : undefined,
        gender: gender || undefined,
        therapistIds: [...selectedTherapistIds],
        parentEmail: parent.email,
        parentMobile: parent.mobile
      });
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add kid");
    } finally {
      setSaving(false);
    }
  }

  if (!parentId) return null;
  if (!parent) return <p className="empty-state">Loading...</p>;

  const activeTherapists = therapists.filter((t) => t.status === "ACTIVE");

  return (
    <div>
      <Link to="/tenant/parents" className="hint-text" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
        ← Back to Parents
      </Link>
      <h1>{formatParentName(parent)}</h1>

      <div className="form-panel" style={{ maxWidth: 480, marginBottom: "1.25rem" }}>
        <div className="field-grid">
          <Field label="Father's name" value={parent.fatherName} />
          <Field label="Mother's name" value={parent.motherName} />
          <Field label="Email" value={parent.email} />
          <Field label="Mobile" value={parent.mobile} />
          <Field label="Address" value={parent.addressLine1} />
          <Field label="City" value={parent.city} />
        </div>
      </div>

      <h2>Kids</h2>

      {canEdit ? (
        <div className="page-toolbar">
          <Button label="Add kid" icon="pi pi-plus" className="p-button-sm" onClick={openDialog} />
        </div>
      ) : null}

      <DataTable
        value={kids}
        emptyMessage="No kids at your centre for this parent."
        size="small"
        stripedRows
        className="mt-3"
        onRowClick={(e) => navigate(`/tenant/kids/${(e.data as Kid).id}`)}
        rowClassName={() => "clickable-row"}
      >
        <Column header="Name" body={(k: Kid) => `${k.firstName} ${k.lastName}`} />
        <Column field="status" header="Status" />
        <Column header="Therapists" body={(k: Kid) => k.therapists.map((t) => t.therapist.name).join(", ") || "—"} />
      </DataTable>

      <Dialog header={`Add a kid to ${formatParentName(parent)}`} visible={dialogOpen} onHide={() => setDialogOpen(false)} style={{ width: "min(480px, 94vw)" }} modal>
        <form onSubmit={handleAddKid} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">First name</span>
              <InputText value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </label>
            <label className="field">
              <span className="field-label">Last name</span>
              <InputText value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </label>
            <label className="field">
              <span className="field-label">Date of birth</span>
              <Calendar value={dob} onChange={(e) => setDob((e.value as Date) ?? null)} dateFormat="dd/mm/yy" showIcon maxDate={new Date()} inputClassName="input" />
            </label>
            <label className="field">
              <span className="field-label">Gender</span>
              <InputText value={gender} onChange={(e) => setGender(e.target.value)} />
            </label>
          </div>

          <fieldset className="form-group">
            <legend>Assigned therapists</legend>
            {activeTherapists.map((t) => (
              <div key={t.id} className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Checkbox inputId={`therapist_${t.id}`} checked={selectedTherapistIds.has(t.id)} onChange={() => toggleTherapist(t.id)} />
                <label htmlFor={`therapist_${t.id}`}>{t.name}</label>
              </div>
            ))}
            {activeTherapists.length === 0 ? <p className="hint-text">No active therapists yet.</p> : null}
          </fieldset>

          {error ? <p className="error-text">{error}</p> : null}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button label="Cancel" type="button" className="p-button-sm p-button-text" onClick={() => setDialogOpen(false)} disabled={saving} />
            <Button label={saving ? "Adding..." : "Add kid"} type="submit" className="p-button-sm" disabled={saving} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
