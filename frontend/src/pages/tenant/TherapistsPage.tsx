import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { TenantDiscipline, Therapist, TherapistInvitation } from "../../api/types";

const STATUS_LABEL: Record<TherapistInvitation["status"], string> = {
  PENDING: "Invited — waiting to accept",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  REVOKED: "Revoked"
};

export function TherapistsPage() {
  const { token, user } = useAuth();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [invitations, setInvitations] = useState<TherapistInvitation[]>([]);
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devInviteUrl, setDevInviteUrl] = useState<string | null>(null);
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    api.listTherapists(token!).then(setTherapists);
    api.listTenantDisciplines(token!).then(setDisciplines);
    if (canEdit) api.listTherapistInvitations(token!).then(setInvitations);
  }

  useEffect(load, [token]);

  const disciplineName = (id: string) => disciplines.find((d) => d.id === id)?.name ?? id;

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setError("");
    const form = new FormData(formEl);
    const disciplineIds = disciplines.filter((d) => form.get(`discipline_${d.id}`) === "on").map((d) => d.id);
    try {
      const result = await api.inviteTherapist(token!, {
        email: String(form.get("email")),
        name: String(form.get("name")),
        disciplineIds
      });
      setSentTo(result.invitation.email);
      setDevInviteUrl(result.inviteUrl ?? null);
      setShowForm(false);
      formEl.reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invitation");
    }
  }

  async function handleRevoke(invitationId: string) {
    try {
      await api.revokeTherapistInvitation(token!, invitationId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke invitation");
    }
  }

  const pendingInvitations = invitations.filter((inv) => inv.status === "PENDING" && !inv.kid);

  return (
    <div>
      <h1>Therapists</h1>

      {sentTo ? (
        <div className="callout">
          <p>
            Invitation sent to <strong>{sentTo}</strong>. They'll show up here once they accept and set their password.
          </p>
          {devInviteUrl ? (
            <p className="hint-text">
              Dev only -- invite link: <code>{devInviteUrl}</code>
            </p>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => setSentTo(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {canEdit ? (
        <>
          <div className="page-toolbar">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "Invite a therapist"}
            </button>
          </div>
          {showForm ? (
            <form onSubmit={handleInvite} className="form-panel">
              <label className="field">
                <span className="field-label">Name</span>
                <input className="input" name="name" required />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input className="input" name="email" type="email" required />
              </label>
              <fieldset className="form-group">
                <legend>Disciplines practiced</legend>
                {disciplines
                  .filter((d) => d.enabled)
                  .map((d) => (
                    <label key={d.id} className="checkbox-row">
                      <input type="checkbox" name={`discipline_${d.id}`} /> {d.name}
                    </label>
                  ))}
              </fieldset>
              <button type="submit" className="btn btn-primary">
                Send invite
              </button>
            </form>
          ) : null}
        </>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Disciplines</th>
            </tr>
          </thead>
          <tbody>
            {therapists.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.user.email}</td>
                <td>{t.disciplineIds.map(disciplineName).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {therapists.length === 0 ? <p className="empty-state">No therapists yet.</p> : null}
      </div>

      {canEdit && pendingInvitations.length > 0 ? (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Pending invitations</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingInvitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>{STATUS_LABEL[inv.status]}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => handleRevoke(inv.id)} style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
