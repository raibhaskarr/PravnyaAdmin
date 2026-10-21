import { useState, type FormEvent } from "react";
import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { PrimaryButton, StepHeading, TextField } from "../components";

export function CreateLogin() {
  const { draft, patchDraft, goNext } = useOnboarding();
  const [touched, setTouched] = useState(false);

  const emailValid = /\S+@\S+\.\S+/.test(draft.email);
  const passwordValid = draft.password.length >= 8;
  const canContinue = emailValid && passwordValid;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (canContinue) goNext();
  }

  return (
    <OnboardingShell>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <StepHeading title="Let's get set up" subtitle="Just a couple of things, the rest can wait." />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          value={draft.email}
          onChange={(e) => patchDraft({ email: e.target.value })}
        />
        {touched && !emailValid ? <p className="text-sm text-red-600">Enter a valid email address.</p> : null}
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={draft.password}
          onChange={(e) => patchDraft({ password: e.target.value })}
        />
        {touched && !passwordValid ? <p className="text-sm text-red-600">At least 8 characters.</p> : null}
        <PrimaryButton type="submit" disabled={!canContinue}>
          Continue
        </PrimaryButton>
      </form>
    </OnboardingShell>
  );
}
