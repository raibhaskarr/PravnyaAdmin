import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { PrimaryButton, StepHeading, TextField } from "../onboarding/components";
import { AuthShell } from "./AuthShell";

// Two phases in one screen (email -> code+new password), same reasoning as VerifyEmail and
// ChildIep: each phase is still one decision ("send me a code" / "set my new password"), it just
// needs the previous phase's result first. Code + new password are combined into the second phase
// rather than split further -- they're submitted together as one resetPassword() call regardless.
export function ForgotPassword({ onBack, onReset }: { onBack: () => void; onReset: (token: string) => void }) {
  const [phase, setPhase] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSendCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.sendVerificationCode(email);
      setPhase("reset");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send a code. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await api.resetPassword({ email, verificationCode: code, newPassword });
      onReset(result.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reset your password. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "reset") {
    return (
      <AuthShell onBack={() => setPhase("email")}>
        <form onSubmit={handleReset} className="flex flex-col gap-5">
          <StepHeading title="Check your email" subtitle={`Enter the code we sent to ${email}, and your new password.`} />
          <TextField id="code" label="Verification code" inputMode="numeric" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <TextField id="newPassword" label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <PrimaryButton type="submit" disabled={submitting || !/^\d{6}$/.test(code) || newPassword.length < 8}>
            {submitting ? "Resetting..." : "Reset password"}
          </PrimaryButton>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell onBack={onBack}>
      <form onSubmit={handleSendCode} className="flex flex-col gap-5">
        <StepHeading title="Reset your password" subtitle="We'll send a code to your email." />
        <TextField id="email" label="Email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <PrimaryButton type="submit" disabled={submitting || !email}>
          {submitting ? "Sending..." : "Send code"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
