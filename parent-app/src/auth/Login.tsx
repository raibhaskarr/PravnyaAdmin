import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { PrimaryButton, StepHeading, TextField } from "../onboarding/components";
import { AuthShell } from "./AuthShell";

export function Login({
  onBack,
  onLoggedIn,
  onForgotPassword,
  onCreateAccount
}: {
  onBack: () => void;
  onLoggedIn: (token: string) => void;
  onForgotPassword: () => void;
  onCreateAccount: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await api.login(email, password);
      onLoggedIn(result.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell onBack={onBack}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <StepHeading title="Welcome back" />
        <TextField id="email" label="Email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <PrimaryButton type="submit" disabled={submitting || !email || !password}>
          {submitting ? "Signing in..." : "Sign in"}
        </PrimaryButton>
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-center text-[0.95rem] font-medium text-[var(--pv-green-700)] underline-offset-4 hover:underline"
        >
          Forgot password?
        </button>
        <button type="button" onClick={onCreateAccount} className="text-center text-[0.95rem] text-[var(--pv-ink-faint)] hover:text-[var(--pv-ink-soft)]">
          New here? Create an account
        </button>
      </form>
    </AuthShell>
  );
}
