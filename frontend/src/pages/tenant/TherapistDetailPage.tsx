import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Tag } from "primereact/tag";
import { Button } from "primereact/button";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, Therapist, TenantDiscipline } from "../../api/types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <span className="field-label">{label}</span>
      <p style={{ margin: "0.1rem 0 0" }}>{value ?? <span className="hint-text">—</span>}</p>
    </div>
  );
}

/** Therapist-centric mirror of KidSupportTeamTab's picker -- that tab assigns therapists to one
 * kid, this page assigns kids to one therapist. Both ultimately write the same KidTherapist join
 * rows, just from opposite directions. */
export function TherapistDetailPage() {
  const { therapistId } = useParams<{ therapistId: string }>();
  const { token } = useAuth();
  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  function load() {
    if (!therapistId) return;
    api.getTherapist(token!, therapistId).then(setTherapist);
    api.listKids(token!).then(setKids);
    api.listTenantDisciplines(token!).then(setDisciplines);
  }

  useEffect(load, [token, therapistId]);

  const disciplineName = (id: string) => disciplines.find((d) => d.id === id)?.name ?? id;
  const assignedKids = therapistId ? kids.filter((k) => k.therapists.some((t) => t.therapist.id === therapistId)) : [];

  function startEditing() {
    setSelectedIds(new Set(assignedKids.map((k) => k.id)));
    setEditing(true);
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!therapistId) return;
    setError("");
    setSaving(true);
    try {
      await api.setTherapistKids(token!, therapistId, [...selectedIds]);
      setEditing(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update assigned kids");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!therapistId || !therapist) return;
    setTogglingStatus(true);
    try {
      const updated = await api.updateTherapist(token!, therapistId, { status: therapist.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE" });
      setTherapist(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setTogglingStatus(false);
    }
  }

  if (!therapistId) return null;
  if (!therapist) return <p className="empty-state">Loading...</p>;

  return (
    <div>
      <Link to="/tenant/therapists" className="hint-text" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
        ← Back to Therapists
      </Link>
      <h1>
        {therapist.name}{" "}
        <Tag
          value={therapist.status === "ACTIVE" ? "Active" : "Deactivated"}
          severity={therapist.status === "ACTIVE" ? "success" : "danger"}
          style={{ verticalAlign: "middle", fontSize: "0.7rem" }}
        />
      </h1>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="form-panel" style={{ maxWidth: 480, marginBottom: "1.25rem" }}>
        <Field label="Email" value={therapist.user.email} />
        <Field label="Phone" value={therapist.phone} />
        <Field label="Disciplines" value={therapist.disciplineIds.map(disciplineName).join(", ") || null} />
        <Button
          label={therapist.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
          className={`p-button-sm p-button-outlined ${therapist.status === "ACTIVE" ? "p-button-danger" : ""}`}
          onClick={toggleStatus}
          disabled={togglingStatus}
          style={{ marginTop: "0.5rem" }}
        />
        {therapist.status === "DEACTIVATED" ? (
          <p className="hint-text" style={{ marginTop: "0.4rem" }}>
            Deactivated therapists can't log in and won't appear as an option when assigning a new kid, but their existing assignments and history are untouched.
          </p>
        ) : null}
      </div>

      <h2>Assigned kids</h2>
      {editing ? (
        <div className="form-panel" style={{ maxWidth: 480 }}>
          <fieldset className="form-group">
            <legend>Kids</legend>
            {kids.map((k) => (
              <label key={k.id} className="checkbox-row">
                <input type="checkbox" checked={selectedIds.has(k.id)} onChange={() => toggle(k.id)} /> {k.firstName} {k.lastName}
                {k.status === "ARCHIVED" ? " — archived" : null}
              </label>
            ))}
            {kids.length === 0 ? <p className="empty-state">No kids in this tenant yet.</p> : null}
          </fieldset>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button label={saving ? "Saving..." : "Save"} className="p-button-sm" onClick={save} disabled={saving} />
            <Button label="Cancel" className="p-button-sm p-button-text" onClick={() => setEditing(false)} disabled={saving} />
          </div>
        </div>
      ) : (
        <div>
          <div className="page-toolbar">
            <Button label="Edit assigned kids" icon="pi pi-pencil" className="p-button-sm p-button-outlined" onClick={startEditing} />
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {assignedKids.map((k) => (
                  <tr key={k.id}>
                    <td>
                      {k.firstName} {k.lastName}
                    </td>
                    <td>{k.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {assignedKids.length === 0 ? <p className="empty-state">No kids assigned yet.</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
