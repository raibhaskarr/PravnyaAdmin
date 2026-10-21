import { useState } from "react";
import { api, ApiError } from "../../api/client";
import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { PrimaryButton, StepHeading } from "../components";

// Never pre-checked -- a parent must actively tick this. Kept as its own screen (not bundled
// onto CreateLogin) so it's a clear, unhurried moment, even though combining it there would also
// be defensible; the checkbox itself stays a single clickable label per standard consent-UX
// guidance, not a wall of legal text.
export function Consent() {
  const { draft, patchDraft, goNext } = useOnboarding();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    setError("");
    setSending(true);
    try {
      await api.sendVerificationCode(draft.email);
      goNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send a verification code. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <OnboardingShell>
      <div className="flex flex-col gap-6">
        <StepHeading
          title="Before we continue"
          subtitle="Pravnya stores information about your child so you and their care team can see progress in one place."
        />
        <label className="flex items-start gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-4">
          <input
            type="checkbox"
            checked={draft.consentAccepted}
            onChange={(e) => patchDraft({ consentAccepted: e.target.checked })}
            className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[var(--pv-green-700)]"
            aria-label="Confirm parent or guardian consent"
          />
          <span className="text-[1rem] leading-relaxed text-[var(--pv-ink)]">
            I'm this child's parent or legal guardian, and I consent to Pravnya storing and processing information about them, as
            described in the{" "}
            <a href="https://pravnya.com/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--pv-green-700)] underline">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <PrimaryButton type="button" disabled={!draft.consentAccepted || sending} onClick={handleContinue}>
          {sending ? "Sending code..." : "Continue"}
        </PrimaryButton>
      </div>
    </OnboardingShell>
  );
}
