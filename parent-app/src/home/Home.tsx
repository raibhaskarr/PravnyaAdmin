import { useEffect, useState } from "react";
import { api, ApiError, type ParentProfile } from "../api/client";
import mark from "../brand/mark.svg";
import { Goals } from "../goals/Goals";
import { Growth } from "../growth/Growth";
import { computeNudge, NudgeCard } from "./nudges";

type Kid = NonNullable<ParentProfile["kids"]>[number];
type View = "home" | "goals" | "growth";

const TABS = [
  { id: "home" as const, label: "Home", icon: "🏠", enabled: true },
  { id: "growth" as const, label: "Growth", icon: "📈", enabled: true },
  { id: "goals" as const, label: "Goals", icon: "🎯", enabled: true }
];

function TabIcon({ tab }: { tab: (typeof TABS)[number] }) {
  return (
    <span className={`text-lg ${tab.enabled ? "" : "opacity-40"}`} aria-hidden="true">
      {tab.icon}
    </span>
  );
}

function NavLabel({ tab }: { tab: (typeof TABS)[number] }) {
  return (
    <span className={`text-xs font-medium ${tab.enabled ? "text-[var(--pv-green-900)]" : "text-[var(--pv-ink-faint)]"}`}>
      {tab.label}
      {!tab.enabled ? " · Soon" : ""}
    </span>
  );
}

export function Home({ token, onSessionExpired, onSignOut }: { token: string; onSessionExpired: () => void; onSignOut: () => void }) {
  const [profile, setProfile] = useState<ParentProfile | null>(null);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("home");

  function refetch() {
    return api
      .me(token)
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onSessionExpired();
        else setError("Couldn't load your home. Try again.");
      });
  }

  useEffect(() => {
    void refetch();
  }, [token, onSessionExpired]);

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--pv-bg)] px-6 text-center">
        <p className="text-[1.05rem] text-[var(--pv-ink-soft)]">{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--pv-bg)]">
        <img src={mark} alt="" className="h-10 w-10 animate-pulse opacity-60" />
      </div>
    );
  }

  const kid: Kid | undefined = profile.kids?.[0];
  const kidName = kid?.firstName || "your child";

  // Goals is its own full screen (own header/back button), same pattern as Login/ForgotPassword
  // being their own App-level phases -- simpler than nesting it inside Home's shell and ending up
  // with two headers, and a parent can still get back to Home with one tap either way.
  if (view === "goals" && kid) {
    return <Goals token={token} kidId={kid.id} onBack={() => setView("home")} />;
  }

  if (view === "growth" && kid) {
    return <Growth token={token} kidId={kid.id} kidName={kidName} onBack={() => setView("home")} />;
  }

  // Dismissed-for-this-session only -- no server-side "don't suggest again" state built yet (that
  // was the original L11-style activation-gap pattern, deliberately not ported, see memory). A
  // reload brings the nudge back; this is a real, known limitation, not an oversight.
  const activeNudge = kid && !dismissed.has(kid.id + computeNudge(kid)) ? computeNudge(kid) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--pv-bg)] md:flex-row">
      {/* Left rail on wide viewports -- bottom tabs (below) take over on narrow ones. */}
      <nav className="hidden w-56 flex-col gap-1 border-r border-[var(--pv-border)] bg-[var(--pv-surface)] p-4 md:flex">
        <div className="mb-4 flex items-center gap-2 px-2">
          <img src={mark} alt="" className="h-6 w-6" />
          <span className="text-[1rem] font-semibold text-[var(--pv-green-900)]">Pravnya</span>
        </div>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={!tab.enabled || tab.id === "home"}
            onClick={() => (tab.id === "goals" || tab.id === "growth") && setView(tab.id)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
              tab.id === "home" ? "bg-[var(--pv-green-100)]" : tab.enabled ? "hover:bg-[var(--pv-border)]" : "cursor-default"
            }`}
          >
            <TabIcon tab={tab} />
            <NavLabel tab={tab} />
          </button>
        ))}
      </nav>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5">
          <div>
            <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">{kidName}</p>
            <p className="text-xs text-[var(--pv-ink-faint)]">{profile.name ? `Signed in as ${profile.name}` : profile.email}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </header>

        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 py-6">
          <div className="rounded-2xl bg-[var(--pv-surface)] px-4 py-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">🤖</span>
              <span className="text-sm font-medium text-[var(--pv-ink-faint)]">Pravnya</span>
            </div>
            <p className="text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">
              Welcome! This is where you'll see {kidName}'s updates as they come in.
            </p>
          </div>

          {activeNudge && kid ? (
            <NudgeCard
              type={activeNudge}
              kidId={kid.id}
              kidName={kidName}
              token={token}
              onResolved={refetch}
              onDismiss={() => setDismissed((prev) => new Set(prev).add(kid.id + activeNudge))}
            />
          ) : (
            <p className="px-1 text-sm text-[var(--pv-ink-faint)]">
              You're all set for now -- we'll let you know when there's something new to look at.
            </p>
          )}
        </main>

        <footer className="border-t border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-full border border-[var(--pv-border)] bg-[var(--pv-bg)] px-4 py-2.5 opacity-60">
            <span className="text-[0.95rem] text-[var(--pv-ink-faint)]">Type, photo, or voice note...</span>
            <span className="ml-auto text-xs text-[var(--pv-ink-faint)]">Soon</span>
          </div>
        </footer>
      </div>

      {/* Bottom tabs on narrow viewports. */}
      <nav className="flex border-t border-[var(--pv-border)] bg-[var(--pv-surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={!tab.enabled || tab.id === "home"}
            onClick={() => (tab.id === "goals" || tab.id === "growth") && setView(tab.id)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5"
          >
            <TabIcon tab={tab} />
            <NavLabel tab={tab} />
          </button>
        ))}
      </nav>
    </div>
  );
}
