import { FormEvent, useEffect, useState } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { SuperadminInvitation, SuperadminUser } from "../../api/types";

const STATUS_LABEL: Record<SuperadminInvitation["status"], string> = {
  PENDING: "Invited — waiting to set up",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  REVOKED: "Revoked"
};

export function SuperadminsPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<SuperadminUser[]>([]);
  const [invitations, setInvitations] = useState<SuperadminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devSignupUrl, setDevSignupUrl] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([api.listSuperadmins(token!), api.listSuperadminInvitations(token!)])
      .then(([u, inv]) => {
        setUsers(u);
        setInvitations(inv);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load superadmins"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setError("");
    try {
      const result = await api.inviteSuperadmin(token!, { email: String(form.get("email")) });
      setSentTo(result.invitation.email);
      setDevSignupUrl(result.signupUrl ?? null);
      setShowForm(false);
      formEl.reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invitation");
    }
  }

  async function handleRevoke(invitationId: string) {
    try {
      await api.revokeSuperadminInvitation(token!, invitationId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke invitation");
    }
  }

  const pendingInvitations = invitations.filter((inv) => inv.status === "PENDING");

  return (
    <div>
      <h1>Superadmins</h1>

      {sentTo ? (
        <div className="callout">
          <p>
            Invitation sent to <strong>{sentTo}</strong>. They'll show up here once they set up their account.
          </p>
          {devSignupUrl ? (
            <p className="hint-text">
              Signup link (also emailed): <code>{devSignupUrl}</code>
            </p>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => setSentTo(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="page-toolbar">
        <button type="button" className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Invite a superadmin"}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={handleInvite} className="form-panel">
          <label className="field">
            <span className="field-label">Email to invite</span>
            <input className="input" name="email" type="email" required />
          </label>
          <button type="submit" className="btn btn-primary">
            Send invite
          </button>
        </form>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <DataTable value={users} loading={loading} emptyMessage="No superadmins yet." sortMode="multiple" removableSort stripedRows size="small">
        <Column field="name" header="Name" sortable />
        <Column field="email" header="Email" sortable />
        <Column header="Added" body={(u: SuperadminUser) => new Date(u.createdAt).toLocaleDateString()} sortable sortField="createdAt" />
      </DataTable>

      {pendingInvitations.length > 0 ? (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Pending invitations</h2>
          <DataTable value={pendingInvitations} size="small" stripedRows>
            <Column field="email" header="Email" />
            <Column header="Status" body={(inv: SuperadminInvitation) => STATUS_LABEL[inv.status]} />
            <Column
              body={(inv: SuperadminInvitation) => (
                <Button label="Revoke" className="p-button-sm p-button-outlined p-button-danger" onClick={() => handleRevoke(inv.id)} />
              )}
            />
          </DataTable>
        </>
      ) : null}
    </div>
  );
}
