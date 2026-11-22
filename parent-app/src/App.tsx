import { useState } from "react";
import { OnboardingProvider } from "./onboarding/OnboardingContext";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { Welcome } from "./onboarding/Welcome";
import { Login } from "./auth/Login";
import { ForgotPassword } from "./auth/ForgotPassword";
import { Home } from "./home/Home";
import { DeleteAccountInfo } from "./account/Account";
import { clearStoredToken, getStoredToken, setStoredToken } from "./session";
import { clearOfflineData } from "./offline";

type Phase = "welcome" | "login" | "forgotPassword" | "onboarding" | "home" | "deleteInfo";

// A stored token resumes straight to Home -- Home itself re-validates it against /me and bounces
// back to Welcome (clearing the stale token) if it's expired/invalid, rather than trusting it blind.
// app.pravnya.com/delete-account is the deletion link listed on Google Play: it explains what
// happens, then (after signing in) opens Profile, where "Delete my account" is.
const DELETE_PATH = "/delete-account";
function cameForDeletion() {
  return typeof window !== "undefined" && window.location.pathname === DELETE_PATH;
}

function initialPhase(): Phase {
  if (cameForDeletion()) return getStoredToken() ? "home" : "deleteInfo";
  return getStoredToken() ? "home" : "welcome";
}

export function App() {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [openProfile] = useState(cameForDeletion);

  function enterHome(newToken: string) {
    setStoredToken(newToken);
    setToken(newToken);
    setPhase("home");
  }

  function signOut() {
    void clearOfflineData();
    clearStoredToken();
    setToken(null);
    setPhase("welcome");
  }

  if (phase === "deleteInfo") {
    return <DeleteAccountInfo onSignIn={() => setPhase("login")} onBack={() => setPhase("welcome")} />;
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
    return <Home token={token!} onSessionExpired={signOut} onSignOut={signOut} initialView={openProfile ? "profile" : "home"} />;
  }

  return (
    <OnboardingProvider>
      <OnboardingFlow onFinish={enterHome} />
    </OnboardingProvider>
  );
}
