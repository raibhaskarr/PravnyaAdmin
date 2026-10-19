import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
import { Button } from "primereact/button";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
// This page is never wrapped by AdminLayout (it's the pre-auth entry point), which is otherwise
// the only place PrimeReact's theme/primeicons CSS gets imported -- without this, Password/Button
// below would render completely unstyled.
import "../adminLayout.css";

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={user.role === "SUPERADMIN" ? "/admin/tenants" : "/tenant/kids"} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <p className="login-brand">Pravnya Admin</p>
        <p className="login-subtitle">Sign in to manage tenants and taxonomy.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="field">
            <span className="field-label">Email</span>
            <InputText type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <Password value={password} onChange={(e) => setPassword(e.target.value)} feedback={false} toggleMask required inputClassName="input" style={{ width: "100%" }} />
          </label>
          <Button label={submitting ? "Signing in..." : "Sign in"} type="submit" className="p-button-sm" disabled={submitting} />
          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}
