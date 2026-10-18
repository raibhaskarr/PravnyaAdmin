import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, Parent, Therapist } from "../../api/types";
import { formatHouseholdName } from "../../utils/household";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <span className="field-label">{label}</span>
      <p style={{ margin: "0.1rem 0 0" }}>{value ?? <span className="hint-text">—</span>}</p>
    </div>
  );
}

export function HouseholdDetailPage() {
  const { parentId } = useParams<{ parentId: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [parent, setParent] = useState<Parent | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    if (!parentId) return;
    api.getHousehold(token!, parentId).then((data) => {
      setParent(data.parent);
      setKids(data.kids);
    });
    api.listTherapists(token!).then(setTherapists);
  }

  useEffect(load, [token, parentId]);

  async function handleAddKid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parent) return;
    const formEl = event.currentTarget;
    setError("");
    setSaving(true);
    const form = new FormData(formEl);
    const therapistIds = therapists.filter((t) => form.get(`therapist_${t.id}`) === "on").map((t) => t.id);
    try {
      // parentEmail/parentMobile are this same household's existing values, not re-entered --
      // createKid's find-or-create-by-email reuses the existing Parent row rather than making a
      // new one.
      await api.createKid(token!, {
        firstName: String(form.get("firstName")),
        lastName: String(form.get("lastName")),
        therapistIds,
        parentEmail: parent.email,
        parentMobile: parent.mobile
      });
      setShowForm(false);
      formEl.reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add kid");
    } finally {
      setSaving(false);
    }
  }

  if (!parentId) return null;
  if (!parent) return <p className="empty-state">Loading...</p>;

  return (
    <div>
      <Link to="/tenant/households" className="hint-text" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
        ← Back to Households
      </Link>
      <h1>{formatHouseholdName(parent)}</h1>

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
        <>
          <div className="page-toolbar">
            <Button
              label={showForm ? "Cancel" : "Add kid"}
              icon={showForm ? "pi pi-times" : "pi pi-plus"}
              className="p-button-sm p-button-outlined"
              onClick={() => setShowForm((v) => !v)}
            />
          </div>
          {showForm ? (
            <form onSubmit={handleAddKid} className="form-panel" style={{ maxWidth: 420 }}>
              <label className="field">
                <span className="field-label">First name</span>
                <input className="input" name="firstName" required />
              </label>
              <label className="field">
                <span className="field-label">Last name</span>
                <input className="input" name="lastName" required />
              </label>
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
                {saving ? "Adding..." : "Add kid"}
              </button>
            </form>
          ) : null}
        </>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <DataTable
        value={kids}
        emptyMessage="No kids at your centre under this household."
        size="small"
        stripedRows
        onRowClick={(e) => navigate(`/tenant/kids/${(e.data as Kid).id}`)}
        rowClassName={() => "clickable-row"}
      >
        <Column header="Name" body={(k: Kid) => `${k.firstName} ${k.lastName}`} />
        <Column field="status" header="Status" />
        <Column header="Therapists" body={(k: Kid) => k.therapists.map((t) => t.therapist.name).join(", ") || "—"} />
      </DataTable>
    </div>
  );
}
