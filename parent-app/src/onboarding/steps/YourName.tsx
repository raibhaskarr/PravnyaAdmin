import type { FormEvent } from "react";
import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { PrimaryButton, StepHeading, TextField } from "../components";

export function YourName() {
  const { draft, patchDraft, goNext } = useOnboarding();
  const canContinue = draft.parentName.trim().length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canContinue) goNext();
  }

  return (
    <OnboardingShell>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <StepHeading title="What should we call you?" />
        <TextField
          id="parentName"
          label="Your name"
          autoFocus
          autoComplete="name"
          value={draft.parentName}
          onChange={(e) => patchDraft({ parentName: e.target.value })}
        />
        <PrimaryButton type="submit" disabled={!canContinue}>
          Continue
        </PrimaryButton>
      </form>
    </OnboardingShell>
  );
}
