import mark from "../../brand/mark.svg";
import { useOnboarding } from "../OnboardingContext";
import { PrimaryButton } from "../components";

export function Done({ onFinish }: { onFinish: () => void }) {
  const { draft } = useOnboarding();
  const firstName = draft.childName.trim().split(" ")[0] || "your child";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--pv-bg)] px-6 text-center">
      <img src={mark} alt="Pravnya" className="h-16 w-16" />
      <div className="w-full max-w-xs">
        <h1 className="text-[1.7rem] font-semibold text-[var(--pv-ink)] text-balance">You're all set</h1>
        <p className="mt-2 text-[1.05rem] leading-relaxed text-[var(--pv-ink-soft)] text-balance">
          Anything you skipped for {firstName} can be added anytime from Home -- no rush.
        </p>
      </div>
      <div className="w-full max-w-xs">
        <PrimaryButton type="button" onClick={onFinish}>
          Go to Home
        </PrimaryButton>
      </div>
    </div>
  );
}
