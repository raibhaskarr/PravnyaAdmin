import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TabView, TabPanel } from "primereact/tabview";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid } from "../../api/types";
import { KidGoalsTab } from "./KidGoalsTab";
import { KidGrowthTab } from "./KidGrowthTab";
import { KidSupportTeamTab } from "./KidSupportTeamTab";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <span className="field-label">{label}</span>
      <p style={{ margin: "0.1rem 0 0" }}>{value ?? <span className="hint-text">—</span>}</p>
    </div>
  );
}

const EMPTY_PARENT_FORM = {
  parentEmail: "",
  parentMobile: "",
  fatherName: "",
  motherName: "",
  addressLine1: "",
  city: ""
};

type ParentFormState = typeof EMPTY_PARENT_FORM;

export function KidDetailPage() {
  const { kidId } = useParams<{ kidId: string }>();
  const { token, user } = useAuth();
  const [kid, setKid] = useState<Kid | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [parentForm, setParentForm] = useState<ParentFormState>(EMPTY_PARENT_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role !== "VIEWER";
  // Inviting or reassigning a kid's support team is a Tenant Admin call, not a therapist's --
  // even a therapist already assigned to this kid can't bring on another therapist for it.
  const canManageTeam = user?.role === "TENANT_ADMIN";

  function load() {
    if (!kidId) return;
    api.listKids(token!).then((kids) => setKid(kids.find((k) => k.id === kidId) ?? null));
  }

  useEffect(load, [token, kidId]);

  function setField<K extends keyof ParentFormState>(key: K, value: ParentFormState[K]) {
    setParentForm((prev) => ({ ...prev, [key]: value }));
  }

  function openDialog() {
    setParentForm(EMPTY_PARENT_FORM);
    setError("");
    setDialogOpen(true);
  }

  async function handleLinkParent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kid) return;
    setError("");
    setSaving(true);
    try {
      await api.updateKid(token!, kid.id, {
        parentEmail: parentForm.parentEmail,
        parentMobile: parentForm.parentMobile,
        fatherName: parentForm.fatherName || undefined,
        motherName: parentForm.motherName || undefined,
        addressLine1: parentForm.addressLine1 || undefined,
        city: parentForm.city || undefined
      });
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link parent");
    } finally {
      setSaving(false);
    }
  }

  if (!kidId) return null;
  if (!kid) return <p className="empty-state">Loading...</p>;

  const kidLabel = `${kid.firstName} ${kid.lastName}`;
  const canLinkParent = user?.role === "TENANT_ADMIN";

  return (
    <div>
      <Link to="/tenant/kids" className="hint-text" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
        ← Back to Kids
      </Link>
      <h1>
        {kidLabel} <span className="hint-text" style={{ fontWeight: 400, fontSize: "0.9rem" }}>{kid.status}</span>
      </h1>

      <TabView renderActiveOnly>
        <TabPanel header="Goals">
          <KidGoalsTab kidId={kid.id} canEdit={canEdit} />
        </TabPanel>
        <TabPanel header="Growth">
          <KidGrowthTab kidId={kid.id} kidLabel={kidLabel} />
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

      <Dialog header={`Link a parent to ${kidLabel}`} visible={dialogOpen} onHide={() => setDialogOpen(false)} style={{ width: "min(560px, 94vw)" }} modal>
        <form onSubmit={handleLinkParent} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <p className="hint-text" style={{ margin: 0 }}>
            If this email already belongs to a parent in the system, this kid is linked to that existing record (the fields below
            are ignored in that case). Otherwise a new parent record is created.
          </p>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Email</span>
              <InputText value={parentForm.parentEmail} onChange={(e) => setField("parentEmail", e.target.value)} type="email" required />
            </label>
            <label className="field">
              <span className="field-label">Mobile</span>
              <InputText value={parentForm.parentMobile} onChange={(e) => setField("parentMobile", e.target.value)} type="tel" required />
            </label>
            <label className="field">
              <span className="field-label">Father's name</span>
              <InputText value={parentForm.fatherName} onChange={(e) => setField("fatherName", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Mother's name</span>
              <InputText value={parentForm.motherName} onChange={(e) => setField("motherName", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Address</span>
              <InputText value={parentForm.addressLine1} onChange={(e) => setField("addressLine1", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">City</span>
              <InputText value={parentForm.city} onChange={(e) => setField("city", e.target.value)} />
            </label>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button label="Cancel" type="button" className="p-button-sm p-button-text" onClick={() => setDialogOpen(false)} disabled={saving} />
            <Button label={saving ? "Linking..." : "Link parent"} type="submit" className="p-button-sm" disabled={saving} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
