import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { PrimaryButton, StepHeading, TextField } from "../components";

export function ChildName() {
  const { draft, patchDraft, goNext } = useOnboarding();
  const canContinue = draft.childName.trim().length > 0;

  return (
    <OnboardingShell>
      <div className="flex flex-col gap-5">
        <StepHeading title="Now let's add your child" subtitle="Just their name and birthday for now -- everything else can wait." />
        <TextField id="childName" label="Child's name" autoFocus value={draft.childName} onChange={(e) => patchDraft({ childName: e.target.value })} />
        <PrimaryButton type="button" disabled={!canContinue} onClick={goNext}>
          Continue
        </PrimaryButton>
      </div>
    </OnboardingShell>
  );
}
