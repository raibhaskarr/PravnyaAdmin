import { useState } from "react";
import { api, ApiError } from "../../api/client";
import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { ChoiceChip, PrimaryButton, SkipLink, StepHeading } from "../components";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Deliberately shallow: just which days, no per-therapy times. That level of detail belongs to
// a real Schedule screen later, not onboarding -- asking for it here would turn one quick screen
// into a form. Same self-reported-only storage as Therapies (Kid.selfReportedScheduleDays) --
// PravnyaAdmin has no real recurring-schedule model at all yet; building one is a separate,
// larger piece of work, not scoped into onboarding.
export function ChildSchedule() {
  const { draft, patchDraft, goNext, skipStep, token, kidId } = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const firstName = draft.childName.trim().split(" ")[0] || "your child";

  function toggle(day: string) {
    patchDraft({
      childScheduleDays: draft.childScheduleDays.includes(day)
        ? draft.childScheduleDays.filter((d) => d !== day)
        : [...draft.childScheduleDays, day],
    });
  }

  async function handleContinue() {
    setError("");
    setSubmitting(true);
    try {
      await api.updateKid(token!, kidId!, { selfReportedScheduleDays: draft.childScheduleDays });
      goNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
    } finally {
      setSubmitting(false);
    }
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <PrimaryButton type="button" disabled={draft.childScheduleDays.length === 0 || submitting} onClick={handleContinue}>
          {submitting ? "Saving..." : "Continue"}
        </PrimaryButton>
        <SkipLink onClick={() => skipStep("child-schedule")} />
      </div>
    </OnboardingShell>
  );
}
