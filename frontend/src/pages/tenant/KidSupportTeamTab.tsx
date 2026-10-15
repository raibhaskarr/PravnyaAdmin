import { FormEvent, useEffect, useState } from "react";
import { TabView, TabPanel } from "primereact/tabview";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { AutoComplete } from "primereact/autocomplete";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, TenantDiscipline, Therapist, TherapistInvitation } from "../../api/types";

type AssignedTherapist = Kid["therapists"][number]["therapist"];

export function KidSupportTeamTab({ kid, canEdit, onUpdated }: { kid: Kid; canEdit: boolean; onUpdated: () => void }) {
  const { token } = useAuth();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<TherapistInvitation[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [nameSearch, setNameSearch] = useState("");
  const [nameSuggestions, setNameSuggestions] = useState<Therapist[]>([]);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const assignedTherapistIds = new Set(kid.therapists.map((t) => t.therapist.id));
  const activeHomeTherapists = therapists.filter((t) => t.status === "ACTIVE" && !assignedTherapistIds.has(t.id));

  function loadInvitations() {
    api.listTherapistInvitations(token!).then((rows) => setPendingInvitations(rows.filter((inv) => inv.status === "PENDING" && inv.kid?.id === kid.id)));
  }

  useEffect(() => {
    api.listTherapists(token!).then(setTherapists);
    api.listTenantDisciplines(token!).then(setDisciplines);
    loadInvitations();
  }, [token, kid.id]);

  const disciplineName = (id: string) => disciplines.find((d) => d.id === id)?.name ?? id;

  function roleLabel(t: AssignedTherapist): { text: string; severity: "success" | "warning" | "info" } {
    const guest = t.tenant.id !== kid.tenantId;
    if (t.status === "DEACTIVATED") return { text: guest ? `Guest, ${t.tenant.name} — deactivated` : "Deactivated", severity: "warning" };
    return guest ? { text: `Guest, ${t.tenant.name}`, severity: "info" } : { text: "Home", severity: "success" };
  }

  function searchByName(query: string) {
    const needle = query.trim().toLowerCase();
    setNameSuggestions(needle ? activeHomeTherapists.filter((t) => t.name.toLowerCase().includes(needle)) : []);
  }

  async function handleAddExisting(therapist: Therapist) {
    setError("");
    setAdding(true);
    try {
      await api.updateKid(token!, kid.id, { therapistIds: [...assignedTherapistIds, therapist.id] });
      setNameSearch("");
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add therapist");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(therapistId: string) {
    setError("");
    setRemovingId(therapistId);
    try {
      await api.updateKid(token!, kid.id, { therapistIds: [...assignedTherapistIds].filter((id) => id !== therapistId) });
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove therapist");
    } finally {
      setRemovingId(null);
    }
  }

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

  return (
    <div>
      {canEdit ? (
        <div className="page-toolbar">
          <Button
            label={addOpen ? "Close" : "Add therapist"}
            icon={addOpen ? "pi pi-times" : "pi pi-plus"}
            className="p-button-sm p-button-outlined"
            onClick={() => setAddOpen((v) => !v)}
          />
        </div>
      ) : null}

      {canEdit && addOpen ? (
        <div className="form-panel" style={{ maxWidth: 480, marginBottom: "1.25rem" }}>
          <TabView>
            <TabPanel header="Search roster">
              <label className="field">
                <span className="field-label">Add an existing therapist</span>
                <AutoComplete
                  value={nameSearch}
                  suggestions={nameSuggestions}
                  completeMethod={(e) => searchByName(e.query)}
                  field="name"
                  placeholder="Search by name..."
                  disabled={adding}
                  onChange={(e) => setNameSearch(typeof e.value === "string" ? e.value : e.value?.name ?? "")}
                  onSelect={(e) => handleAddExisting(e.value as Therapist)}
                  inputClassName="input"
                  style={{ width: "100%" }}
                />
              </label>
              <p className="hint-text" style={{ marginTop: "0.4rem" }}>
                Only matches therapists already on this tenant's roster. For someone not listed, use the Invite by email tab.
              </p>
            </TabPanel>

            <TabPanel header="Invite by email">
              <form onSubmit={handleInviteByEmail} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <label className="field">
                  <span className="field-label">Email</span>
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
                <Button label={inviting ? "Adding..." : "Add"} className="p-button-sm" type="submit" disabled={inviting} />
                <p className="hint-text">
                  If this email already belongs to a therapist here, they're added right away (disciplines above are ignored). Otherwise they'll get an invite to set up their account with these disciplines.
                </p>
              </form>
            </TabPanel>
          </TabView>
        </div>
      ) : null}

      {inviteNotice ? <p className="hint-text">{inviteNotice}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <DataTable value={kid.therapists} emptyMessage="No therapists assigned yet." size="small" stripedRows>
        <Column header="Name" body={(row: Kid["therapists"][number]) => row.therapist.name} />
        <Column header="Discipline" body={(row: Kid["therapists"][number]) => row.therapist.disciplineIds.map(disciplineName).join(", ") || "—"} />
        <Column
          header="Role"
          body={(row: Kid["therapists"][number]) => {
            const role = roleLabel(row.therapist);
            return <Tag value={role.text} severity={role.severity} />;
          }}
        />
        {canEdit ? (
          <Column
            body={(row: Kid["therapists"][number]) => (
              <Button
                label="Remove"
                className="p-button-sm p-button-outlined p-button-danger"
                onClick={() => handleRemove(row.therapist.id)}
                disabled={removingId === row.therapist.id}
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
            <Column
              body={(inv: TherapistInvitation) => (
                <Button label="Revoke" className="p-button-sm p-button-outlined p-button-danger" onClick={() => handleRevokeInvitation(inv.id)} />
              )}
            />
          </DataTable>
        </>
      ) : null}
    </div>
  );
}
