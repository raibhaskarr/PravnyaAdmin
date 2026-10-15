import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
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
  const navigate = useNavigate();
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
      const phone = String(form.get("phone") || "");
      const result = await api.inviteTherapist(token!, {
        email: String(form.get("email")),
        name: String(form.get("name")),
        phone: phone || undefined,
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

  async function toggleStatus(therapist: Therapist) {
    try {
      await api.updateTherapist(token!, therapist.id, { status: therapist.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
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
              Invite link (also emailed): <code>{devInviteUrl}</code>
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
              <label className="field">
                <span className="field-label">Phone</span>
                <input className="input" name="phone" type="tel" />
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

      <DataTable
        value={therapists}
        emptyMessage="No therapists yet."
        sortMode="multiple"
        removableSort
        stripedRows
        size="small"
        onRowClick={canEdit ? (e) => navigate(`/tenant/therapists/${(e.data as Therapist).id}`) : undefined}
        rowClassName={() => (canEdit ? "clickable-row" : "")}
      >
        <Column field="name" header="Name" sortable />
        <Column field="user.email" header="Email" sortable body={(t: Therapist) => t.user.email} />
        <Column field="phone" header="Phone" body={(t: Therapist) => t.phone ?? "—"} />
        <Column header="Disciplines" body={(t: Therapist) => t.disciplineIds.map(disciplineName).join(", ") || "—"} />
        <Column
          header="Status"
          body={(t: Therapist) => <Tag value={t.status === "ACTIVE" ? "Active" : "Deactivated"} severity={t.status === "ACTIVE" ? "success" : "danger"} />}
        />
        {canEdit ? (
          <Column
            body={(t: Therapist) => (
              <Button
                label={t.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                className={`p-button-sm p-button-outlined ${t.status === "ACTIVE" ? "p-button-danger" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStatus(t);
                }}
              />
            )}
          />
        ) : null}
      </DataTable>

      {canEdit && pendingInvitations.length > 0 ? (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Pending invitations</h2>
          <DataTable value={pendingInvitations} size="small" stripedRows>
            <Column field="email" header="Email" />
            <Column header="Status" body={(inv: TherapistInvitation) => STATUS_LABEL[inv.status]} />
            <Column
              body={(inv: TherapistInvitation) => (
                <Button label="Revoke" className="p-button-sm p-button-outlined p-button-danger" onClick={() => handleRevoke(inv.id)} />
              )}
            />
          </DataTable>
        </>
      ) : null}
    </div>
  );
}
