import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TabView, TabPanel } from "primereact/tabview";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Calendar } from "primereact/calendar";
import { AutoComplete } from "primereact/autocomplete";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, ParentSummary } from "../../api/types";
import { formatParentName } from "../../utils/parent";
import { KidGoalsTab } from "./KidGoalsTab";
import { KidGrowthTab } from "./KidGrowthTab";
import { KidActivitiesTab } from "./KidActivitiesTab";
import { KidSupportTeamTab } from "./KidSupportTeamTab";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <span className="field-label">{label}</span>
      <p style={{ margin: "0.1rem 0 0" }}>{value ?? <span className="hint-text">—</span>}</p>
    </div>
  );
}

type ParentSuggestion = ParentSummary & { displayName: string };

function formatDob(dob: string | null): string | null {
  return dob ? new Date(dob).toLocaleDateString() : null;
}

export function KidDetailPage() {
  const { kidId } = useParams<{ kidId: string }>();
  const { token, user } = useAuth();
  const [kid, setKid] = useState<Kid | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [parents, setParents] = useState<ParentSummary[]>([]);
  const [nameSearch, setNameSearch] = useState("");
  const [nameSuggestions, setNameSuggestions] = useState<ParentSuggestion[]>([]);
  const [parentEmail, setParentEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingOverview, setEditingOverview] = useState(false);
  const [overviewDob, setOverviewDob] = useState<Date | null>(null);
  const [overviewGender, setOverviewGender] = useState("");
  const [savingOverview, setSavingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const canEdit = user?.role !== "VIEWER";
  // Inviting or reassigning a kid's support team is a Tenant Admin call, not a therapist's --
  // even a therapist already assigned to this kid can't bring on another therapist for it.
  const canManageTeam = user?.role === "TENANT_ADMIN";

  function load() {
    if (!kidId) return;
    api.listKids(token!).then((kids) => setKid(kids.find((k) => k.id === kidId) ?? null));
  }

  useEffect(load, [token, kidId]);

  function openDialog() {
    setNameSearch("");
    setParentEmail("");
    setError("");
    setDialogOpen(true);
    api.listParents(token!).then(setParents);
  }

  function searchByName(query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      setNameSuggestions([]);
      return;
    }
    setNameSuggestions(
      parents
        .filter((p) => p.fatherName?.toLowerCase().includes(needle) || p.motherName?.toLowerCase().includes(needle))
        .map((p) => ({ ...p, displayName: formatParentName(p) }))
    );
  }

  async function linkParent(email: string) {
    if (!kid) return;
    setError("");
    setSaving(true);
    try {
      await api.updateKid(token!, kid.id, { parentEmail: email });
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link parent");
    } finally {
      setSaving(false);
    }
  }

  function handleLinkByEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    linkParent(parentEmail);
  }

  function startEditingOverview() {
    if (!kid) return;
    setOverviewDob(kid.dob ? new Date(kid.dob) : null);
    setOverviewGender(kid.gender ?? "");
    setOverviewError("");
    setEditingOverview(true);
  }

  async function saveOverview() {
    if (!kid) return;
    setOverviewError("");
    setSavingOverview(true);
    try {
      await api.updateKid(token!, kid.id, {
        dob: overviewDob ? overviewDob.toISOString() : null,
        gender: overviewGender || null
      });
      setEditingOverview(false);
      load();
    } catch (err) {
      setOverviewError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSavingOverview(false);
    }
  }

  if (!kidId) return null;
  if (!kid) return <p className="empty-state">Loading...</p>;

  const kidLabel = `${kid.firstName} ${kid.lastName}`;
  const canLinkParent = user?.role === "TENANT_ADMIN";
  const canEditOverview = user?.role === "TENANT_ADMIN";

  return (
    <div>
      <Link to="/tenant/kids" className="hint-text" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
        ← Back to Kids
      </Link>
      <h1>
        {kidLabel} <span className="hint-text" style={{ fontWeight: 400, fontSize: "0.9rem" }}>{kid.status}</span>
      </h1>

      <TabView renderActiveOnly>
        <TabPanel header="Overview">
          {editingOverview ? (
            <div className="form-panel" style={{ maxWidth: 480 }}>
              <div className="field-grid">
                <label className="field">
                  <span className="field-label">Date of birth</span>
                  <Calendar
                    value={overviewDob}
                    onChange={(e) => setOverviewDob((e.value as Date) ?? null)}
                    dateFormat="dd/mm/yy"
                    showIcon
                    maxDate={new Date()}
                    inputClassName="input"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Gender</span>
                  <InputText value={overviewGender} onChange={(e) => setOverviewGender(e.target.value)} />
                </label>
              </div>
              {overviewError ? <p className="error-text">{overviewError}</p> : null}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button label={savingOverview ? "Saving..." : "Save"} className="p-button-sm" onClick={saveOverview} disabled={savingOverview} />
                <Button label="Cancel" className="p-button-sm p-button-text" onClick={() => setEditingOverview(false)} disabled={savingOverview} />
              </div>
            </div>
          ) : (
            <div className="form-panel" style={{ maxWidth: 480 }}>
              <div className="field-grid">
                <Field label="Status" value={kid.status} />
                <Field label="Date of birth" value={formatDob(kid.dob)} />
                <Field label="Gender" value={kid.gender} />
              </div>
              {canEditOverview ? (
                <Button label="Edit" icon="pi pi-pencil" className="p-button-sm p-button-outlined" onClick={startEditingOverview} />
              ) : null}
            </div>
          )}
        </TabPanel>
        <TabPanel header="Goals">
          <KidGoalsTab kidId={kid.id} canEdit={canEdit} />
        </TabPanel>
        <TabPanel header="Growth">
          <KidGrowthTab kidId={kid.id} kidLabel={kidLabel} />
        </TabPanel>
        <TabPanel header="Activities">
          <KidActivitiesTab kidId={kid.id} kidLabel={kidLabel} />
        </TabPanel>
        <TabPanel header="Support Team">
          <KidSupportTeamTab kid={kid} canEdit={canManageTeam} onUpdated={load} />
        </TabPanel>
        <TabPanel header="Parent">
          {kid.parent ? (
            <div className="form-panel" style={{ maxWidth: 480 }}>
              <div className="field-grid">
                <Field label="Father's name" value={kid.parent.fatherName} />
                <Field label="Mother's name" value={kid.parent.motherName} />
                <Field label="Email" value={kid.parent.email} />
                <Field label="Mobile" value={kid.parent.mobile} />
                <Field label="Address" value={kid.parent.addressLine1} />
                <Field label="City" value={kid.parent.city} />
              </div>
              <Link to={`/tenant/parents/${kid.parent.id}`} className="hint-text">
                View parent (siblings, add a kid) →
              </Link>
            </div>
          ) : (
            <div>
              <p className="empty-state">No parent info on file for this kid yet.</p>
              {canLinkParent ? <Button label="Link a parent" icon="pi pi-plus" className="p-button-sm" onClick={openDialog} /> : null}
            </div>
          )}
        </TabPanel>
      </TabView>

      <Dialog header={`Link a parent to ${kidLabel}`} visible={dialogOpen} onHide={() => setDialogOpen(false)} style={{ width: "min(460px, 94vw)" }} modal>
        <TabView>
          <TabPanel header="Search by name">
            <label className="field">
              <span className="field-label">Parent name</span>
              <AutoComplete
                value={nameSearch}
                suggestions={nameSuggestions}
                completeMethod={(e) => searchByName(e.query)}
                field="displayName"
                placeholder="Search by father's or mother's name..."
                disabled={saving}
                onChange={(e) => setNameSearch(typeof e.value === "string" ? e.value : e.value?.displayName ?? "")}
                onSelect={(e) => linkParent((e.value as ParentSuggestion).email)}
                inputClassName="input"
                style={{ width: "100%" }}
              />
            </label>
            <p className="hint-text" style={{ marginTop: "0.4rem" }}>
              Only matches parents already visible to you. For someone not listed, use the By email tab.
            </p>
          </TabPanel>

          <TabPanel header="By email">
            <form onSubmit={handleLinkByEmail} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              <p className="hint-text" style={{ margin: 0 }}>
                Links this kid to the parent already registered with this email. No parent found with that email?{" "}
                <Link to="/tenant/parents">Add them from Parents</Link> first.
              </p>
              <label className="field">
                <span className="field-label">Email</span>
                <InputText value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} type="email" required />
              </label>
              <Button label={saving ? "Linking..." : "Link parent"} type="submit" className="p-button-sm" disabled={saving} />
            </form>
          </TabPanel>
        </TabView>

        {error ? <p className="error-text">{error}</p> : null}
      </Dialog>
    </div>
  );
}
