import { useState } from "react";
import { api, ApiError } from "../../api/client";
import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { ChoiceChip, PrimaryButton, SkipLink, StepHeading } from "../components";

const OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

// The actual "create the kid" call happens here, not at the child-dob step -- gender is the last
// adjacent field before the heavier optional screens (therapies/schedule/IEP, none wired to the
// backend yet), so waiting one screen gets the most complete record in a single create call
// instead of create-then-patch (no kid-update endpoint exists for parents yet).
export function ChildGender() {
  const { draft, patchDraft, goNext, skipStep, token } = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const firstName = draft.childName.trim().split(" ")[0] || "your child";

  async function createKid(gender: string | null) {
    setError("");
    setSubmitting(true);
    try {
      await api.createFirstKid(token!, {
        name: draft.childName,
        dob: new Date(draft.childDob).toISOString(),
        ...(gender ? { gender } : {})
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
      setSubmitting(false);
      return false;
    }
    setSubmitting(false);
    return true;
  }

  async function handleContinue() {
    if (await createKid(draft.childGender)) goNext();
  }

  async function handleSkip() {
    if (await createKid(null)) skipStep("child-gender");
  }

  return (
    <OnboardingShell>
      <div className="flex flex-col gap-5">
        <StepHeading title={`What's ${firstName}'s gender?`} subtitle="Optional -- skip if you'd rather not say." />
        <div className="flex flex-wrap gap-2.5">
          {OPTIONS.map((opt) => (
            <ChoiceChip key={opt} label={opt} selected={draft.childGender === opt} onClick={() => patchDraft({ childGender: opt })} />
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <PrimaryButton type="button" disabled={!draft.childGender || submitting} onClick={handleContinue}>
          {submitting ? "Saving..." : "Continue"}
        </PrimaryButton>
        <SkipLink onClick={handleSkip} />
      </div>
    </OnboardingShell>
  );
}
