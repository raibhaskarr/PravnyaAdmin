import mark from "../../brand/mark.svg";
import { useOnboarding } from "../OnboardingContext";
import { PrimaryButton } from "../components";

export function Done({ onFinish }: { onFinish: (token: string) => void }) {
  const { draft, token } = useOnboarding();
  const firstName = draft.childName.trim().split(" ")[0];
  // Empty only when VerifyEmail jumped straight here -- the child-name step (required on every
  // other path) never ran, because register() turned out to claim an account that already had
  // kids attached. Different message: there's nothing "skipped" to reassure them about here.
  const skippedOnboarding = !firstName;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--pv-bg)] px-6 text-center">
      <img src={mark} alt="Pravnya" className="h-16 w-16" />
      <div className="w-full max-w-xs">
        <h1 className="text-[1.7rem] font-semibold text-[var(--pv-ink)] text-balance">You're all set</h1>
        <p className="mt-2 text-[1.05rem] leading-relaxed text-[var(--pv-ink-soft)] text-balance">
          {skippedOnboarding
            ? "Your account's ready -- head to Home to see what's already there."
            : `Anything you skipped for ${firstName} can be added anytime from Home -- no rush.`}
        </p>
      </div>
      <div className="w-full max-w-xs">
        <PrimaryButton type="button" onClick={() => onFinish(token!)}>
          Go to Home
        </PrimaryButton>
      </div>
    </div>
  );
}
