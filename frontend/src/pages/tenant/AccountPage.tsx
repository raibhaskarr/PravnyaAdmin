import { FormEvent, useEffect, useState } from "react";
import { TabView, TabPanel } from "primereact/tabview";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { InputNumber } from "primereact/inputnumber";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Password } from "primereact/password";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { CanonicalDiscipline } from "../../api/types";

function PasswordSection() {
  const { token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(token!, { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.9rem", maxWidth: 420 }}>
      <label className="field">
        <span className="field-label">Current password</span>
        <Password value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} feedback={false} toggleMask required inputClassName="input" style={{ width: "100%" }} />
      </label>
      <label className="field">
        <span className="field-label">New password</span>
        <Password value={newPassword} onChange={(e) => setNewPassword(e.target.value)} toggleMask required minLength={8} inputClassName="input" style={{ width: "100%" }} />
      </label>
      <label className="field">
        <span className="field-label">Confirm new password</span>
        <Password value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} feedback={false} toggleMask required minLength={8} inputClassName="input" style={{ width: "100%" }} />
      </label>

      {error ? <p className="error-text">{error}</p> : null}
      {saved ? <p className="hint-text">Password changed.</p> : null}

      <Button label={saving ? "Saving..." : "Change password"} className="p-button-sm" type="submit" disabled={saving} />
    </form>
  );
}

function ProfileSection() {
  const { token } = useAuth();
  const [canonicalDisciplines, setCanonicalDisciplines] = useState<CanonicalDiscipline[]>([]);
  const [loading, setLoading] = useState(true);
  const [dob, setDob] = useState<Date | null>(null);
  const [gender, setGender] = useState("");
  const [bio, setBio] = useState("");
  const [yearsOfExperience, setYearsOfExperience] = useState<number | null>(null);
  const [qualifiedDisciplineIds, setQualifiedDisciplineIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getOwnTherapist(token!), api.listCanonicalDisciplines(token!)])
      .then(([therapist, disciplines]) => {
        setDob(therapist.dob ? new Date(therapist.dob) : null);
        setGender(therapist.gender ?? "");
        setBio(therapist.bio ?? "");
        setYearsOfExperience(therapist.yearsOfExperience);
        setQualifiedDisciplineIds(new Set(therapist.qualifiedDisciplineIds));
        setCanonicalDisciplines(disciplines);
      })
      .finally(() => setLoading(false));
  }, [token]);

  function toggleQualifiedDiscipline(id: string) {
    setQualifiedDisciplineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await api.updateOwnTherapist(token!, {
        dob: dob ? dob.toISOString() : null,
        gender: gender || null,
        bio: bio || null,
        yearsOfExperience,
        qualifiedDisciplineIds: [...qualifiedDisciplineIds]
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="hint-text">Loading...</p>;

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0.9rem", maxWidth: 560 }}>
      <p className="hint-text" style={{ margin: 0 }}>
        Seen by your centre's admin, not required to practice -- fill in what you're comfortable sharing.
      </p>
      <div className="field-grid">
        <label className="field">
          <span className="field-label">Date of birth</span>
          <Calendar value={dob} onChange={(e) => setDob((e.value as Date) ?? null)} dateFormat="dd/mm/yy" showIcon maxDate={new Date()} inputClassName="input" />
        </label>
        <label className="field">
          <span className="field-label">Gender</span>
          <InputText value={gender} onChange={(e) => setGender(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Years of experience</span>
          <InputNumber value={yearsOfExperience} onValueChange={(e) => setYearsOfExperience(e.value)} min={0} max={80} inputClassName="input" />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Bio (education, background)</span>
        <InputTextarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="input" autoResize />
      </label>

      <fieldset className="form-group">
        <legend>Qualified in</legend>
        <p className="hint-text" style={{ marginTop: "-0.3rem", marginBottom: "0.5rem" }}>
          What you're credentialed/trained in -- may be broader than what this centre currently has you practicing.
        </p>
        {canonicalDisciplines.map((d) => (
          <div key={d.id} className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Checkbox inputId={`qualified_${d.id}`} checked={qualifiedDisciplineIds.has(d.id)} onChange={() => toggleQualifiedDiscipline(d.id)} />
            <label htmlFor={`qualified_${d.id}`}>{d.name}</label>
          </div>
        ))}
      </fieldset>

      {error ? <p className="error-text">{error}</p> : null}
      {saved ? <p className="hint-text">Profile saved.</p> : null}

      <Button label={saving ? "Saving..." : "Save profile"} className="p-button-sm" type="submit" disabled={saving} />
    </form>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  const isTherapist = user?.role === "THERAPIST";

  if (!user) return null;

  return (
    <div>
      <h1>{isTherapist ? "My Profile" : "Account"}</h1>
      <div style={{ marginBottom: "1rem" }}>
        <span className="field-label">Email</span>
        <p style={{ margin: "0.1rem 0 0" }}>{user.email}</p>
      </div>

      {isTherapist ? (
        <TabView>
          <TabPanel header="Profile">
            <ProfileSection />
          </TabPanel>
          <TabPanel header="Password">
            <PasswordSection />
          </TabPanel>
        </TabView>
      ) : (
        <PasswordSection />
      )}
    </div>
  );
}
