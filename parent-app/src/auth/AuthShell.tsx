import type { ReactNode } from "react";

// Lightweight sibling to OnboardingShell -- same back-button-plus-centered-content layout, but no
// progress bar/step machinery, since Login and ForgotPassword aren't part of the tracked
// onboarding sequence at all (they're how a RETURNING parent gets in, not a first-time flow).
export function AuthShell({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8">{children}</main>
    </div>
  );
}
