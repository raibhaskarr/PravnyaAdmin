import { useState } from "react";
import { OnboardingProvider } from "./onboarding/OnboardingContext";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { Welcome } from "./onboarding/Welcome";
import { Login } from "./auth/Login";
import { ForgotPassword } from "./auth/ForgotPassword";
import { Home } from "./home/Home";
import { clearStoredToken, getStoredToken, setStoredToken } from "./session";

type Phase = "welcome" | "login" | "forgotPassword" | "onboarding" | "home";

// A stored token resumes straight to Home -- Home itself re-validates it against /me and bounces
// back to Welcome (clearing the stale token) if it's expired/invalid, rather than trusting it blind.
function initialPhase(): Phase {
  return getStoredToken() ? "home" : "welcome";
}

export function App() {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [token, setToken] = useState<string | null>(getStoredToken);

  function enterHome(newToken: string) {
    setStoredToken(newToken);
    setToken(newToken);
    setPhase("home");
  }

  function signOut() {
    clearStoredToken();
    setToken(null);
    setPhase("welcome");
  }

  if (phase === "welcome") {
    return <Welcome onStart={() => setPhase("onboarding")} onSignIn={() => setPhase("login")} />;
  }

  if (phase === "login") {
    return <Login onBack={() => setPhase("welcome")} onLoggedIn={enterHome} onForgotPassword={() => setPhase("forgotPassword")} onCreateAccount={() => setPhase("onboarding")} />;
  }

  if (phase === "forgotPassword") {
    return <ForgotPassword onBack={() => setPhase("login")} onReset={enterHome} />;
  }

  if (phase === "home") {
    return <Home token={token!} onSessionExpired={signOut} onSignOut={signOut} />;
  }

  return (
    <OnboardingProvider>
      <OnboardingFlow onFinish={enterHome} />
    </OnboardingProvider>
  );
}
