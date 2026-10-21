import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { PrimaryButton, StepHeading, TextField } from "../components";

export function ChildDob() {
  const { draft, patchDraft, goNext } = useOnboarding();
  const canContinue = draft.childDob.length === 10;
  const firstName = draft.childName.trim().split(" ")[0] || "your child";

  return (
    <OnboardingShell>
      <div className="flex flex-col gap-5">
        <StepHeading title={`When was ${firstName} born?`} />
        <TextField
          id="childDob"
          label="Date of birth"
          type="date"
          autoFocus
          max={new Date().toISOString().slice(0, 10)}
          value={draft.childDob}
          onChange={(e) => patchDraft({ childDob: e.target.value })}
        />
        <PrimaryButton type="button" disabled={!canContinue} onClick={goNext}>
          Continue
        </PrimaryButton>
      </div>
    </OnboardingShell>
  );
}
