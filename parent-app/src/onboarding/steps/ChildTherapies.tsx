import { useState } from "react";
import { api, ApiError } from "../../api/client";
import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { ChoiceChip, PrimaryButton, SkipLink, StepHeading } from "../components";

const THERAPIES = ["Speech therapy", "ABA", "Occupational therapy", "Physiotherapy", "Special education", "Other"];

// Self-reported only -- these aren't linked to a real Therapist/centre (none chosen yet), just
// tags on the Kid record (Kid.selfReportedTherapies) for later reference. Skipping saves nothing;
// there's no "empty but confirmed skipped" distinction worth persisting server-side for this field.
export function ChildTherapies() {
  const { draft, patchDraft, goNext, skipStep, token, kidId } = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const firstName = draft.childName.trim().split(" ")[0] || "your child";

  function toggle(therapy: string) {
    patchDraft({
      childTherapies: draft.childTherapies.includes(therapy)
        ? draft.childTherapies.filter((t) => t !== therapy)
        : [...draft.childTherapies, therapy],
    });
  }

  async function handleContinue() {
    setError("");
    setSubmitting(true);
    try {
      await api.updateKid(token!, kidId!, { selfReportedTherapies: draft.childTherapies });
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
        <StepHeading title={`What kind of support does ${firstName} get right now?`} subtitle="Optional -- pick as many as apply." />
        <div className="flex flex-wrap gap-2.5">
          {THERAPIES.map((t) => (
            <ChoiceChip key={t} label={t} selected={draft.childTherapies.includes(t)} onClick={() => toggle(t)} />
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <PrimaryButton type="button" disabled={draft.childTherapies.length === 0 || submitting} onClick={handleContinue}>
          {submitting ? "Saving..." : "Continue"}
        </PrimaryButton>
        <SkipLink onClick={() => skipStep("child-therapies")} />
      </div>
    </OnboardingShell>
  );
}
