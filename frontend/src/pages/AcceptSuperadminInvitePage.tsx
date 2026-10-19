import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
import { Button } from "primereact/button";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import type { SuperadminInvitationPreview } from "../api/types";
// Never wrapped by AdminLayout (pre-auth) -- see LoginPage.tsx's same import for why this is
// needed directly here.
import "../adminLayout.css";

export function AcceptSuperadminInvitePage() {
  const { token: inviteToken } = useParams<{ token: string }>();
  const { user, setSession } = useAuth();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<SuperadminInvitationPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    api
      .previewSuperadminSignup(inviteToken)
      .then(setPreview)
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
      const result = await api.acceptSuperadminSignup(inviteToken!, { name, password });
      setSession(result.token, result.user);
      navigate("/admin/tenants", { replace: true });
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
            <p className="login-subtitle">Set up your superadmin account on Pravnya.</p>
            <form onSubmit={handleSubmit} className="login-form">
              <label className="field">
                <span className="field-label">Your name</span>
                <InputText required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <InputText value={preview.email} disabled />
              </label>
              <label className="field">
                <span className="field-label">Set a password</span>
                <Password
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  toggleMask
                  inputClassName="input"
                  style={{ width: "100%" }}
                />
              </label>
              <label className="field">
                <span className="field-label">Confirm password</span>
                <Password
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  feedback={false}
                  toggleMask
                  inputClassName="input"
                  style={{ width: "100%" }}
                />
              </label>
              <Button label={submitting ? "Setting up your account..." : "Accept and continue"} type="submit" className="p-button-sm" disabled={submitting} />
              {submitError ? <p className="error-text">{submitError}</p> : null}
            </form>
          </>
        )}
      </div>
    </main>
  );
}
