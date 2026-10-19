import { FormEvent, useEffect, useState } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [saving, setSaving] = useState(false);
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

  function openDialog() {
    setEmail("");
    setInviteError("");
    setDialogOpen(true);
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError("");
    setSaving(true);
    try {
      const result = await api.inviteSuperadmin(token!, { email });
      setSentTo(result.invitation.email);
      setDevSignupUrl(result.signupUrl ?? null);
      setDialogOpen(false);
      load();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to send invitation");
    } finally {
      setSaving(false);
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
          <Button label="Dismiss" className="p-button-sm p-button-text" onClick={() => setSentTo(null)} />
        </div>
      ) : null}

      <div className="page-toolbar">
        <Button label="Invite a superadmin" icon="pi pi-plus" className="p-button-sm" onClick={openDialog} />
      </div>

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

      <Dialog header="Invite a superadmin" visible={dialogOpen} onHide={() => setDialogOpen(false)} style={{ width: "min(420px, 94vw)" }} modal>
        <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <label className="field">
            <span className="field-label">Email to invite</span>
            <InputText value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoFocus />
          </label>

          {inviteError ? <p className="error-text">{inviteError}</p> : null}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button label="Cancel" type="button" className="p-button-sm p-button-text" onClick={() => setDialogOpen(false)} disabled={saving} />
            <Button label={saving ? "Sending..." : "Send invite"} type="submit" className="p-button-sm" disabled={saving} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
