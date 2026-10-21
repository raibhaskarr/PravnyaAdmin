import { useRef } from "react";
import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { PrimaryButton, SkipLink, StepHeading } from "../components";

// Heaviest-lift optional step (a real file), placed last on purpose. Extraction/review happens
// after onboarding, not here -- this screen only accepts the file.
export function ChildIep() {
  const { draft, patchDraft, goNext, skipStep } = useOnboarding();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <OnboardingShell>
      <div className="flex flex-col gap-5">
        <StepHeading title="Have an IEP document handy?" subtitle="Optional -- upload now or add it anytime later." />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-10 text-center transition hover:border-[var(--pv-green-500)]"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--pv-green-700)]">
            <path d="M12 16V4m0 0L7 9m5-5l5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[1rem] font-medium text-[var(--pv-ink)]">{draft.childIepFile ? draft.childIepFile.name : "Tap to choose a file"}</span>
          <span className="text-sm text-[var(--pv-ink-faint)]">PDF, photo, or scan</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => patchDraft({ childIepFile: e.target.files?.[0] ?? null })}
        />
        <PrimaryButton type="button" disabled={!draft.childIepFile} onClick={goNext}>
          Continue
        </PrimaryButton>
        <SkipLink onClick={() => skipStep("child-iep")} />
      </div>
    </OnboardingShell>
  );
}
