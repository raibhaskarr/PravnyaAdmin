import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

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
    <main style={{ fontFamily: "sans-serif", maxWidth: 360, margin: "4rem auto" }}>
      <h1>Pravnya Admin</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Password
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: "block", width: "100%" }} />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      </form>
    </main>
  );
}
