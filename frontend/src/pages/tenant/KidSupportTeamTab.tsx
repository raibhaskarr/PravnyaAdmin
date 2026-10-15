import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, TenantDiscipline, Therapist, TherapistInvitation } from "../../api/types";

export function KidSupportTeamTab({ kid, canEdit, onUpdated }: { kid: Kid; canEdit: boolean; onUpdated: () => void }) {
  const { token } = useAuth();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<TherapistInvitation[]>([]);
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  function loadInvitations() {
    api.listTherapistInvitations(token!).then((rows) => setPendingInvitations(rows.filter((inv) => inv.status === "PENDING" && inv.kid?.id === kid.id)));
  }

  useEffect(() => {
    api.listTherapists(token!).then(setTherapists);
    api.listTenantDisciplines(token!).then(setDisciplines);
    loadInvitations();
  }, [token, kid.id]);

  async function handleRevokeInvitation(invitationId: string) {
    setError("");
    try {
      await api.revokeTherapistInvitation(token!, invitationId);
      loadInvitations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke invitation");
    }
  }

  async function handleInviteByEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setInviteNotice(null);
    const formData = new FormData(form);
    const email = String(formData.get("email"));
    const disciplineIds = disciplines.filter((d) => formData.get(`discipline_${d.id}`) === "on").map((d) => d.id);
    setInviting(true);
    try {
      const result = await api.inviteTherapistForKid(token!, kid.id, email, disciplineIds);
      if (result.linked) {
        setInviteNotice(`${result.therapist.name} is already a therapist here -- added to the support team.`);
      } else {
        setInviteNotice(`Invited ${email} -- they'll show up here once they accept and set their password.${result.inviteUrl ? ` Invite link (also emailed): ${result.inviteUrl}` : ""}`);
      }
      form.reset();
      onUpdated();
      loadInvitations();
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

  function guestLabel(therapistTenantId: string, therapistTenantName: string) {
    return therapistTenantId === kid.tenantId ? null : ` — guest, ${therapistTenantName}`;
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
            <fieldset className="form-group">
              <legend>Disciplines (if inviting someone new)</legend>
              {disciplines
                .filter((d) => d.enabled)
                .map((d) => (
                  <label key={d.id} className="checkbox-row">
                    <input type="checkbox" name={`discipline_${d.id}`} /> {d.name}
                  </label>
                ))}
            </fieldset>
            <button type="submit" className="btn btn-primary" disabled={inviting}>
              {inviting ? "Adding..." : "Add"}
            </button>
            <p className="hint-text" style={{ marginTop: "0.4rem" }}>
              If this email already belongs to a therapist here, they're added right away (disciplines above are ignored). Otherwise they'll get an invite to set up their account with these disciplines.
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
                  <td>
                    {t.therapist.name}
                    {guestLabel(t.therapist.tenant.id, t.therapist.tenant.name)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {kid.therapists.length === 0 ? <p className="empty-state">No therapists assigned yet.</p> : null}
        </div>

        {canEdit && pendingInvitations.length > 0 ? (
          <>
            <h3 style={{ marginTop: "1rem" }}>Pending invitations</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.email}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleRevokeInvitation(inv.id)}
                          style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }}
                        >
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

  // Union of the home-tenant ACTIVE roster (for adding someone new) and the kid's
  // currently-linked therapists (which may include guests from another tenant, via the "Add by
  // email" flow, or a now-deactivated home therapist this kid was already assigned before they
  // were deactivated) -- otherwise an already-linked therapist has no checkbox at all and becomes
  // unmanageable here. Deactivated home therapists are excluded only from being newly *added*.
  const activeHomeTherapists = therapists.filter((t) => t.status === "ACTIVE");
  const pickerOptions = [
    ...activeHomeTherapists.map((t) => ({ id: t.id, name: t.name, tenantId: t.tenantId, tenantName: t.tenant?.name ?? "", deactivated: false })),
    ...kid.therapists
      .filter((t) => !activeHomeTherapists.some((home) => home.id === t.therapist.id))
      .map((t) => ({
        id: t.therapist.id,
        name: t.therapist.name,
        tenantId: t.therapist.tenant.id,
        tenantName: t.therapist.tenant.name,
        deactivated: therapists.find((home) => home.id === t.therapist.id)?.status === "DEACTIVATED"
      }))
  ];

  return (
    <div className="form-panel" style={{ maxWidth: 480 }}>
      <fieldset className="form-group">
        <legend>Assigned therapists</legend>
        {pickerOptions.map((t) => (
          <label key={t.id} className="checkbox-row">
            <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggle(t.id)} /> {t.name}
            {guestLabel(t.tenantId, t.tenantName)}
            {t.deactivated ? " — deactivated" : null}
          </label>
        ))}
        {pickerOptions.length === 0 ? <p className="empty-state">No therapists to assign yet.</p> : null}
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
