import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { ChoiceChip, PrimaryButton, SkipLink, StepHeading } from "../components";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Deliberately shallow: just which days, no per-therapy times. That level of detail belongs to
// a real Schedule screen later, not onboarding -- asking for it here would turn one quick screen
// into a form.
export function ChildSchedule() {
  const { draft, patchDraft, goNext, skipStep } = useOnboarding();
  const firstName = draft.childName.trim().split(" ")[0] || "your child";

  function toggle(day: string) {
    patchDraft({
      childScheduleDays: draft.childScheduleDays.includes(day)
        ? draft.childScheduleDays.filter((d) => d !== day)
        : [...draft.childScheduleDays, day],
    });
  }

  return (
    <OnboardingShell>
      <div className="flex flex-col gap-5">
        <StepHeading title={`Which days does ${firstName} usually have therapy?`} subtitle="Optional -- you can add exact times later." />
        <div className="flex flex-wrap gap-2.5">
          {DAYS.map((day) => (
            <ChoiceChip key={day} label={day} selected={draft.childScheduleDays.includes(day)} onClick={() => toggle(day)} />
          ))}
        </div>
        <PrimaryButton type="button" disabled={draft.childScheduleDays.length === 0} onClick={goNext}>
          Continue
        </PrimaryButton>
        <SkipLink onClick={() => skipStep("child-schedule")} />
      </div>
    </OnboardingShell>
  );
}
