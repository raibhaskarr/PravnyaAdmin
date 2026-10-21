import mark from "../brand/mark.svg";
import { PrimaryButton } from "./components";

// The real first-impression moment -- modeled on Pravnya's actual splash screen composition
// (mark, bold wordmark, tagline) rather than just a small logo tucked into a header. This screen
// sits outside the tracked onboarding step sequence on purpose: no progress bar, no back target,
// it's a threshold, not a question.
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-[var(--pv-bg)] px-6 text-center">
      <img src={mark} alt="Pravnya" className="h-24 w-24" />
      <div className="w-full max-w-xs">
        <h1 className="text-[2rem] font-bold text-[var(--pv-green-900)]">Pravnya</h1>
        <p className="mt-2 text-[1.1rem] leading-relaxed text-[var(--pv-ink-soft)] text-balance">
          See your child's progress, all in one place.
        </p>
      </div>
      <div className="w-full max-w-xs">
        <PrimaryButton type="button" onClick={onStart}>
          Get started
        </PrimaryButton>
      </div>
    </div>
  );
}
