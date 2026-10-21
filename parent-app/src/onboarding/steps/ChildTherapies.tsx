import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { ChoiceChip, PrimaryButton, SkipLink, StepHeading } from "../components";

const THERAPIES = ["Speech therapy", "ABA", "Occupational therapy", "Physiotherapy", "Special education", "Other"];

export function ChildTherapies() {
  const { draft, patchDraft, goNext, skipStep } = useOnboarding();
  const firstName = draft.childName.trim().split(" ")[0] || "your child";

  function toggle(therapy: string) {
    patchDraft({
      childTherapies: draft.childTherapies.includes(therapy)
        ? draft.childTherapies.filter((t) => t !== therapy)
        : [...draft.childTherapies, therapy],
    });
  }

  return (
    <OnboardingShell>
      <div className="flex flex-col gap-5">
        <StepHeading title={`What kind of support does ${firstName} get right now?`} subtitle="Optional -- pick as many as apply." />
        <div className="flex flex-wrap gap-2.5">
          {THERAPIES.map((t) => (
            <ChoiceChip key={t} label={t} selected={draft.childTherapies.includes(t)} onClick={() => toggle(t)} />
          ))}
        </div>
        <PrimaryButton type="button" disabled={draft.childTherapies.length === 0} onClick={goNext}>
          Continue
        </PrimaryButton>
        <SkipLink onClick={() => skipStep("child-therapies")} />
      </div>
    </OnboardingShell>
  );
}
