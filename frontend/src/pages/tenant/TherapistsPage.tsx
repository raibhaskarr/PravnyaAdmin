import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Checkbox } from "primereact/checkbox";
import { Tag } from "primereact/tag";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, TenantDiscipline, Therapist, TherapistInvitation } from "../../api/types";

const STATUS_LABEL: Record<TherapistInvitation["status"], string> = {
  PENDING: "Invited — waiting to accept",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  REVOKED: "Revoked"
};

const EMPTY_FORM = { name: "", email: "", phone: "" };
type FormState = typeof EMPTY_FORM;

export function TherapistsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [invitations, setInvitations] = useState<TherapistInvitation[]>([]);
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedDisciplineIds, setSelectedDisciplineIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devInviteUrl, setDevInviteUrl] = useState<string | null>(null);
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    api.listTherapists(token!).then(setTherapists);
    api.listTenantDisciplines(token!).then(setDisciplines);
    api.listKids(token!).then(setKids);
    if (canEdit) api.listTherapistInvitations(token!).then(setInvitations);
  }

  useEffect(load, [token]);

  const disciplineName = (id: string) => disciplines.find((d) => d.id === id)?.name ?? id;

  // Visibility-scoped the same way the kids list already is (see kidAccess.ts's
  // kidVisibilityFilter): a TENANT_ADMIN/VIEWER sees an accurate count for every therapist; a
  // THERAPIST only ever sees kids they're themselves assigned to, so counts for colleagues they
  // don't share a kid with read low -- that's the existing privacy boundary working as intended,
  // not a bug specific to this column.
  const kidCountByTherapistId = new Map<string, number>();
  for (const kid of kids) {
    for (const { therapist } of kid.therapists) {
      kidCountByTherapistId.set(therapist.id, (kidCountByTherapistId.get(therapist.id) ?? 0) + 1);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openDialog() {
    setForm(EMPTY_FORM);
    setSelectedDisciplineIds(new Set());
    setInviteError("");
    setDialogOpen(true);
  }

  function toggleDiscipline(disciplineId: string) {
    setSelectedDisciplineIds((prev) => {
      const next = new Set(prev);
      if (next.has(disciplineId)) next.delete(disciplineId);
      else next.add(disciplineId);
      return next;
    });
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError("");
    setSaving(true);
    try {
      const result = await api.inviteTherapist(token!, {
        email: form.email,
        name: form.name,
        phone: form.phone || undefined,
        disciplineIds: [...selectedDisciplineIds]
      });
      setSentTo(result.invitation.email);
      setDevInviteUrl(result.inviteUrl ?? null);
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
        <div className="page-toolbar">
          <Button label="Invite a therapist" icon="pi pi-plus" className="p-button-sm" onClick={openDialog} />
        </div>
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
        <Column header="Kids" sortable sortField="kidCount" body={(t: Therapist) => kidCountByTherapistId.get(t.id) ?? 0} />
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

      <Dialog header="Invite a therapist" visible={dialogOpen} onHide={() => setDialogOpen(false)} style={{ width: "min(480px, 94vw)" }} modal>
        <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <label className="field">
            <span className="field-label">Name</span>
            <InputText value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <InputText value={form.email} onChange={(e) => set("email", e.target.value)} type="email" required />
          </label>
          <label className="field">
            <span className="field-label">Phone</span>
            <InputText value={form.phone} onChange={(e) => set("phone", e.target.value)} type="tel" />
          </label>

          <fieldset className="form-group">
            <legend>Disciplines practiced</legend>
            {disciplines
              .filter((d) => d.enabled)
              .map((d) => (
                <div key={d.id} className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Checkbox inputId={`discipline_${d.id}`} checked={selectedDisciplineIds.has(d.id)} onChange={() => toggleDiscipline(d.id)} />
                  <label htmlFor={`discipline_${d.id}`}>{d.name}</label>
                </div>
              ))}
          </fieldset>

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
