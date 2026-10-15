import { FormEvent, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";

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

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
