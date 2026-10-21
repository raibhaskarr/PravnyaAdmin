import { useState } from "react";
import { api, ApiError } from "../../api/client";
import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { PrimaryButton, StepHeading, TextField } from "../components";

export function VerifyEmail() {
  const { draft, patchDraft, goNext, setToken } = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canContinue = /^\d{6}$/.test(draft.verificationCode);

  async function handleContinue() {
    setError("");
    setSubmitting(true);
    try {
      const result = await api.register({
        email: draft.email,
        password: draft.password,
        name: draft.parentName,
        verificationCode: draft.verificationCode,
        consent: true
      });
      setToken(result.token);
      goNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't verify that code. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell>
      <div className="flex flex-col gap-5">
        <StepHeading title="Check your email" subtitle={`We sent a 6-digit code to ${draft.email || "your email"}.`} />
        <TextField
          id="code"
          label="Verification code"
          inputMode="numeric"
          autoFocus
          maxLength={6}
          value={draft.verificationCode}
          onChange={(e) => patchDraft({ verificationCode: e.target.value.replace(/\D/g, "") })}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <PrimaryButton type="button" disabled={!canContinue || submitting} onClick={handleContinue}>
          {submitting ? "Verifying..." : "Continue"}
        </PrimaryButton>
      </div>
    </OnboardingShell>
  );
}
