import { useState } from "react";
import { OnboardingProvider } from "./onboarding/OnboardingContext";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { Welcome } from "./onboarding/Welcome";

type Phase = "welcome" | "onboarding" | "finished";

// Onboarding is the only thing built so far -- Home/Growth/Goals and real routing land once
// onboarding itself is signed off.
export function App() {
  const [phase, setPhase] = useState<Phase>("welcome");

  if (phase === "welcome") {
    return <Welcome onStart={() => setPhase("onboarding")} />;
  }

  if (phase === "finished") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--pv-bg)] px-6 text-center">
        <p className="text-[1.05rem] text-[var(--pv-ink-soft)]">Home isn't built yet -- onboarding flow complete.</p>
      </div>
    );
  }

  return (
    <OnboardingProvider>
      <OnboardingFlow onFinish={() => setPhase("finished")} />
    </OnboardingProvider>
  );
}
