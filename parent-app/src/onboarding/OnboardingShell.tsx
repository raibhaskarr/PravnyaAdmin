import type { ReactNode } from "react";
import { OPTIONAL_STEPS } from "./types";
import { useOnboarding } from "./OnboardingContext";

/**
 * Shared chrome for every onboarding screen: back button, logo, progress.
 *
 * Progress is deliberately different in character for required vs. optional steps -- a hard
 * progress bar during the required path (it's short, finishing it is the goal), but just a soft
 * "almost there" label once we're into skippable territory, so skipping something never reads as
 * falling behind on a bar that's tracking you.
 */
export function OnboardingShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { stepId, stepIndex, goBack, requiredStepNumber, requiredStepCount } = useOnboarding();
  const isOptional = OPTIONAL_STEPS.includes(stepId as (typeof OPTIONAL_STEPS)[number]);
  const isDone = stepId === "done";

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--pv-bg)]">
      {/*
        No brand mark here, deliberately -- checked how PranTrackingSystem's own onboarding wizard
        handles this: the logo only ever appears as a substantial hero element (64px Landing
        screen, 56px "Welcome back" header), never repeated small on inner steps. Every inner step
        there is just a bare back button. Matching that rather than re-solving a problem they
        already solved.
      */}
      <header className="flex items-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        {stepIndex > 0 && !isDone ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <div className="h-9 w-9" />
        )}
      </header>

      {requiredStepNumber !== null ? (
        <div className="px-5 pt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--pv-border)]">
            <div
              className="h-full rounded-full bg-[var(--pv-green-500)] transition-all duration-300"
              style={{ width: `${(requiredStepNumber / requiredStepCount) * 100}%` }}
            />
          </div>
        </div>
      ) : isOptional ? (
        <div className="px-5 pt-4">
          <p className="text-sm font-medium text-[var(--pv-ink-faint)]">Almost there — a few optional details</p>
        </div>
      ) : null}

      <main className="flex flex-1 flex-col justify-center px-5 py-8 mx-auto w-full max-w-md">{children}</main>

      {footer ? <footer className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{footer}</footer> : null}
    </div>
  );
}
