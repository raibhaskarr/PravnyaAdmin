import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import type { InvitationPreview } from "../api/types";

export function AcceptInvitePage() {
  const { token: inviteToken } = useParams<{ token: string }>();
  const { user, setSession } = useAuth();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    api
      .previewInvitation(inviteToken)
      .then((p) => {
        setPreview(p);
        if (p.name) setName(p.name);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "This invite link isn't valid."));
  }, [inviteToken]);

  if (user) return <Navigate to={user.role === "SUPERADMIN" ? "/admin/tenants" : "/tenant/kids"} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError("");
    if (password !== confirmPassword) {
      setSubmitError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.acceptInvitation(inviteToken!, { name, password });
      setSession(result.token, result.user);
      navigate("/tenant/kids", { replace: true });
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't accept this invite.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <p className="login-brand">Pravnya Admin</p>

        {loadError ? (
          <p className="error-text">{loadError}</p>
        ) : !preview ? (
          <p className="login-subtitle">Loading your invite...</p>
        ) : (
          <>
            <p className="login-subtitle">
              {preview.kidName
                ? `Join ${preview.kidName}'s care team at ${preview.tenantName} as a therapist.`
                : `Join ${preview.tenantName} on Pravnya as a therapist.`}
            </p>
            <form onSubmit={handleSubmit} className="login-form">
              <label className="field">
                <span className="field-label">Your name</span>
                <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input className="input" value={preview.email} disabled />
              </label>
              <label className="field">
                <span className="field-label">Set a password</span>
                <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Confirm password</span>
                <input className="input" type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </label>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Setting up your account..." : "Accept and continue"}
              </button>
              {submitError ? <p className="error-text">{submitError}</p> : null}
            </form>
          </>
        )}
      </div>
    </main>
  );
}
