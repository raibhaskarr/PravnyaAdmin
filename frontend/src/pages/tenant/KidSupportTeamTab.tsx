import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, Therapist } from "../../api/types";

export function KidSupportTeamTab({ kid, canEdit, onUpdated }: { kid: Kid; canEdit: boolean; onUpdated: () => void }) {
  const { token } = useAuth();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  useEffect(() => {
    api.listTherapists(token!).then(setTherapists);
  }, [token]);

  async function handleInviteByEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setInviteNotice(null);
    const email = String(new FormData(form).get("email"));
    setInviting(true);
    try {
      const result = await api.inviteTherapistForKid(token!, kid.id, email);
      if (result.linked) {
        setInviteNotice(`${result.therapist.name} is already a therapist here -- added to the support team.`);
      } else {
        setInviteNotice(`Invited ${email} -- they'll show up here once they accept and set their password.${result.inviteUrl ? ` Dev link: ${result.inviteUrl}` : ""}`);
      }
      form.reset();
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite this email");
    } finally {
      setInviting(false);
    }
  }

  function startEditing() {
    setSelectedIds(new Set(kid.therapists.map((t) => t.therapist.id)));
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
    setError("");
    try {
      await api.updateKid(token!, kid.id, { therapistIds: [...selectedIds] });
      setEditing(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update support team");
    }
  }

  if (!editing) {
    return (
      <div>
        {canEdit ? (
          <div className="page-toolbar">
            <button type="button" className="btn btn-secondary" onClick={startEditing}>
              Edit support team
            </button>
          </div>
        ) : null}

        {canEdit ? (
          <form onSubmit={handleInviteByEmail} className="form-panel" style={{ maxWidth: 420, marginBottom: "1rem" }}>
            <label className="field">
              <span className="field-label">Add by email</span>
              <input className="input" name="email" type="email" required placeholder="therapist@example.com" />
            </label>
            <button type="submit" className="btn btn-primary" disabled={inviting}>
              {inviting ? "Adding..." : "Add"}
            </button>
            <p className="hint-text" style={{ marginTop: "0.4rem" }}>
              If this email already belongs to a therapist here, they're added right away. Otherwise they'll get an invite to set up their account.
            </p>
          </form>
        ) : null}
        {inviteNotice ? <p className="hint-text">{inviteNotice}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Therapist</th>
              </tr>
            </thead>
            <tbody>
              {kid.therapists.map((t) => (
                <tr key={t.therapist.id}>
                  <td>{t.therapist.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {kid.therapists.length === 0 ? <p className="empty-state">No therapists assigned yet.</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="form-panel" style={{ maxWidth: 480 }}>
      <fieldset className="form-group">
        <legend>Assigned therapists</legend>
        {therapists.map((t) => (
          <label key={t.id} className="checkbox-row">
            <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggle(t.id)} /> {t.name}
          </label>
        ))}
        {therapists.length === 0 ? <p className="empty-state">No therapists in this tenant yet.</p> : null}
      </fieldset>
      {error ? <p className="error-text">{error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" className="btn btn-primary" onClick={save}>
          Save
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
