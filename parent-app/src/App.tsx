import { useState } from "react";
import { OnboardingProvider } from "./onboarding/OnboardingContext";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { Welcome } from "./onboarding/Welcome";
import { Login } from "./auth/Login";
import { ForgotPassword } from "./auth/ForgotPassword";

type Phase = "welcome" | "login" | "forgotPassword" | "onboarding" | "finished";

// Onboarding is the only thing built so far -- Home/Growth/Goals and real routing land once
// onboarding itself is signed off. "finished" covers both a completed signup and a successful
// sign-in/reset -- there's nowhere else to send either of them yet.
export function App() {
  const [phase, setPhase] = useState<Phase>("welcome");

  if (phase === "welcome") {
    return <Welcome onStart={() => setPhase("onboarding")} onSignIn={() => setPhase("login")} />;
  }

  if (phase === "login") {
    return (
      <Login
        onBack={() => setPhase("welcome")}
        onLoggedIn={() => setPhase("finished")}
        onForgotPassword={() => setPhase("forgotPassword")}
        onCreateAccount={() => setPhase("onboarding")}
      />
    );
  }

  if (phase === "forgotPassword") {
    return <ForgotPassword onBack={() => setPhase("login")} onReset={() => setPhase("finished")} />;
  }

  if (phase === "finished") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--pv-bg)] px-6 text-center">
        <p className="text-[1.05rem] text-[var(--pv-ink-soft)]">Home isn't built yet.</p>
      </div>
    );
  }

  return (
    <OnboardingProvider>
      <OnboardingFlow onFinish={() => setPhase("finished")} />
    </OnboardingProvider>
  );
}
