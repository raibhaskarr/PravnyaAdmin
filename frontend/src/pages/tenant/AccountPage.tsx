import { FormEvent, useEffect, useState } from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { InputNumber } from "primereact/inputnumber";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { CanonicalDiscipline } from "../../api/types";

/** Self-service password change -- available to every tenant-scoped role (admin, therapist,
 * viewer), not just TENANT_ADMIN, since PATCH /auth/password itself has no role restriction.
 * Mirrors the superadmin's AccountPage.tsx, using this section's plain hand-rolled form styling
 * instead of PrimeReact. */
export function AccountPage() {
  const { user, token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const isTherapist = user?.role === "THERAPIST";

  // Professional profile -- the therapist's own, not the Tenant Admin's invite/edit form. Always
  // editable (no separate Edit toggle): it's the therapist's own record, not someone else's being
  // reviewed, same reasoning TenantProfilePage already uses for its own business-profile form.
  const [canonicalDisciplines, setCanonicalDisciplines] = useState<CanonicalDiscipline[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [dob, setDob] = useState<Date | null>(null);
  const [gender, setGender] = useState("");
  const [bio, setBio] = useState("");
  const [yearsOfExperience, setYearsOfExperience] = useState<number | null>(null);
  const [qualifiedDisciplineIds, setQualifiedDisciplineIds] = useState<Set<string>>(new Set());
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!isTherapist) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    Promise.all([api.getOwnTherapist(token!), api.listCanonicalDisciplines(token!)])
      .then(([therapist, disciplines]) => {
        setDob(therapist.dob ? new Date(therapist.dob) : null);
        setGender(therapist.gender ?? "");
        setBio(therapist.bio ?? "");
        setYearsOfExperience(therapist.yearsOfExperience);
        setQualifiedDisciplineIds(new Set(therapist.qualifiedDisciplineIds));
        setCanonicalDisciplines(disciplines);
      })
      .finally(() => setProfileLoading(false));
  }, [token, isTherapist]);

  function toggleQualifiedDiscipline(id: string) {
    setQualifiedDisciplineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    setSavingProfile(true);
    try {
      await api.updateOwnTherapist(token!, {
        dob: dob ? dob.toISOString() : null,
        gender: gender || null,
        bio: bio || null,
        yearsOfExperience,
        qualifiedDisciplineIds: [...qualifiedDisciplineIds]
      });
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  }

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

  if (!user) return null;

  return (
    <div>
      <h1>Account</h1>

      {isTherapist ? (
        <div className="form-panel" style={{ maxWidth: 560, marginBottom: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Professional profile</h2>
          <p className="hint-text" style={{ marginTop: "-0.4rem" }}>
            Seen by your centre's admin, not required to practice -- fill in what you're comfortable sharing.
          </p>
          {profileLoading ? (
            <p className="hint-text">Loading...</p>
          ) : (
            <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
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

              {profileError ? <p className="error-text">{profileError}</p> : null}
              {profileSaved ? <p className="hint-text">Profile saved.</p> : null}

              <Button label={savingProfile ? "Saving..." : "Save profile"} className="p-button-sm" type="submit" disabled={savingProfile} />
            </form>
          )}
        </div>
      ) : null}

      <div className="form-panel" style={{ maxWidth: 420 }}>
        <div style={{ marginBottom: "0.6rem" }}>
          <span className="field-label">Email</span>
          <p style={{ margin: "0.1rem 0 0" }}>{user.email}</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <fieldset className="form-group">
            <legend>Change password</legend>
            <label className="field">
              <span className="field-label">Current password</span>
              <input
                className="input"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">New password</span>
              <input className="input" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Confirm new password</span>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
          </fieldset>

          {error ? <p className="error-text">{error}</p> : null}
          {saved ? <p className="hint-text">Password changed.</p> : null}

          <Button label={saving ? "Saving..." : "Change password"} className="p-button-sm" type="submit" disabled={saving} />
        </form>
      </div>
    </div>
  );
}
