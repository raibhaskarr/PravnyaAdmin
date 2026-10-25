import { useEffect, useState } from "react";
import { api, ApiError, type CompanionMessage, type Goal, type ParentProfile } from "../api/client";
import mark from "../brand/mark.svg";
import { Activities } from "../activities/Activities";
import { Goals } from "../goals/Goals";
import { Growth } from "../growth/Growth";
import { LogSession } from "../log/LogSession";
import { buildFeed, FeedCard } from "./feed";
import { computeNudge, NudgeCard } from "./nudges";

type Kid = NonNullable<ParentProfile["kids"]>[number];
type View = "home" | "goals" | "growth" | "activities" | "logSession";

const TABS = [
  { id: "home" as const, label: "Home", icon: "🏠", enabled: true },
  { id: "growth" as const, label: "Growth", icon: "📈", enabled: true },
  { id: "activities" as const, label: "Activities", icon: "🧩", enabled: true },
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

// Only rendered when there's more than one kid -- the common case (one kid) keeps the header
// exactly as it was, a plain name with no affordance implying there's anything to switch between.
function KidSwitcher({
  kids,
  selectedKidId,
  onSelect
}: {
  kids: { id: string; firstName: string }[];
  selectedKidId: string;
  onSelect: (kidId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = kids.find((k) => k.id === selectedKidId) ?? kids[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[1.05rem] font-semibold text-[var(--pv-ink)]"
      >
        {selected.firstName}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <>
          <button type="button" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute left-0 top-full z-20 mt-1.5 min-w-[9rem] overflow-hidden rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] py-1 shadow-md">
            {kids.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => {
                  onSelect(k.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-[0.92rem] ${
                  k.id === selected.id ? "font-semibold text-[var(--pv-green-700)]" : "text-[var(--pv-ink)] hover:bg-[var(--pv-bg)]"
                }`}
              >
                {k.firstName}
                {k.id === selected.id ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// A real back-and-forth, not another digest card -- the parent's own messages get a distinct
// right-aligned style so a genuine conversation reads clearly top-to-bottom, same visual grammar
// as any messaging app. Assistant replies reuse the same 🤖 Pravnya card look as everything else
// on Home (feed items, the nudge) rather than inventing a third style.
function ThreadMessage({ message }: { message: CompanionMessage }) {
  if (message.role === "PARENT") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--pv-green-700)] px-4 py-2.5 text-[0.95rem] text-white">{message.content}</div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-[var(--pv-surface)] px-4 py-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">🤖</span>
        <span className="text-sm font-medium text-[var(--pv-ink-faint)]">Pravnya</span>
      </div>
      <p className="text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">{message.content}</p>
    </div>
  );
}

export function Home({ token, onSessionExpired, onSignOut }: { token: string; onSessionExpired: () => void; onSignOut: () => void }) {
  const [profile, setProfile] = useState<ParentProfile | null>(null);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("home");
  // Null until the parent actively picks one -- falls back to the first kid below, same as before
  // a switcher existed, so a one-kid account (the common case) behaves exactly as it always did.
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);
  // Drives the feed below -- same Goal[] shape Growth/Goals/Activities each already fetch
  // independently; Home needs its own copy since it renders a digest of all three at once.
  const [goals, setGoals] = useState<Goal[] | null>(null);
  // The real conversation thread, separate from the digest feed above -- persisted server-side
  // (companion.service.ts), fetched fresh whenever the kid changes.
  const [thread, setThread] = useState<CompanionMessage[]>([]);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  // Carries what was typed into the composer across the LogSession navigation when the companion
  // call decides this was a "log" intent -- LogSession seeds its own text field from this.
  const [pendingLogText, setPendingLogText] = useState<string | undefined>(undefined);

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

  // kid is computed here (not after the early returns below) so this effect can depend on
  // kid?.id -- hooks can't follow a conditional return, and the feed needs to refetch whenever
  // the parent switches kids via KidSwitcher, not just once on mount.
  const kids = profile?.kids ?? [];
  const kid: Kid | undefined = kids.find((k) => k.id === selectedKidId) ?? kids[0];
  const kidName = kid?.firstName || "your child";

  useEffect(() => {
    if (!kid) return;
    setGoals(null);
    void api.listGoals(token, kid.id).then(setGoals).catch(() => setGoals([]));
    void api.listCompanionMessages(token, kid.id).then(setThread).catch(() => setThread([]));
  }, [token, kid?.id]);

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

  // Returning from any screen that can create evidence re-fetches goals so the feed below
  // reflects it immediately, rather than waiting for the next kid-switch to catch up. Also
  // refetches the thread -- a "log"-routed message was already persisted server-side before the
  // navigation into LogSession, so it only becomes visible here once we come back.
  function backToHome() {
    setView("home");
    if (kid) {
      void api.listGoals(token, kid.id).then(setGoals).catch(() => {});
      void api.listCompanionMessages(token, kid.id).then(setThread).catch(() => {});
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = composerText.trim();
    if (!text || !kid || sending) return;
    setSending(true);
    setComposerText("");
    try {
      const result = await api.sendCompanionMessage(token, kid.id, text);
      if (result.intent === "log") {
        setPendingLogText(text);
        setView("logSession");
      } else {
        setThread((prev) => [
          ...prev,
          { id: `local-${Date.now()}-u`, role: "PARENT", content: text, createdAt: new Date().toISOString() },
          { id: `local-${Date.now()}-a`, role: "ASSISTANT", content: result.reply, createdAt: new Date().toISOString() }
        ]);
      }
    } catch (err) {
      setComposerText(text);
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
    } finally {
      setSending(false);
    }
  }

  // Goals is its own full screen (own header/back button), same pattern as Login/ForgotPassword
  // being their own App-level phases -- simpler than nesting it inside Home's shell and ending up
  // with two headers, and a parent can still get back to Home with one tap either way.
  if (view === "goals" && kid) {
    return <Goals token={token} kidId={kid.id} onBack={backToHome} />;
  }

  if (view === "growth" && kid) {
    return <Growth token={token} kidId={kid.id} kidName={kidName} onBack={() => setView("home")} />;
  }

  if (view === "activities" && kid) {
    return <Activities token={token} kidId={kid.id} onBack={backToHome} />;
  }

  if (view === "logSession" && kid) {
    return (
      <LogSession
        token={token}
        kidId={kid.id}
        kidName={kidName}
        initialText={pendingLogText}
        onBack={() => {
          setPendingLogText(undefined);
          backToHome();
        }}
      />
    );
  }

  // Dismissed-for-this-session only -- no server-side "don't suggest again" state built yet (that
  // was the original L11-style activation-gap pattern, deliberately not ported, see memory). A
  // reload brings the nudge back; this is a real, known limitation, not an oversight.
  const activeNudge = kid && !dismissed.has(kid.id + computeNudge(kid)) ? computeNudge(kid) : null;
  const feed = goals ? buildFeed(goals) : [];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--pv-bg)] md:flex-row">
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
            onClick={() => (tab.id === "goals" || tab.id === "growth" || tab.id === "activities") && setView(tab.id)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
              tab.id === "home" ? "bg-[var(--pv-green-100)]" : tab.enabled ? "hover:bg-[var(--pv-border)]" : "cursor-default"
            }`}
          >
            <TabIcon tab={tab} />
            <NavLabel tab={tab} />
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5">
          <div>
            {kids.length > 1 && kid ? (
              <KidSwitcher kids={kids} selectedKidId={kid.id} onSelect={setSelectedKidId} />
            ) : (
              <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">{kidName}</p>
            )}
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

        <main className="mx-auto flex w-full min-h-0 max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-5 py-6">
          {activeNudge && kid ? (
            <NudgeCard
              type={activeNudge}
              kidId={kid.id}
              kidName={kidName}
              token={token}
              onResolved={refetch}
              onDismiss={() => setDismissed((prev) => new Set(prev).add(kid.id + activeNudge))}
            />
          ) : null}

          {feed.map((item, i) => (
            <FeedCard key={i} item={item} kidName={kidName} onNavigate={setView} />
          ))}

          {!activeNudge && feed.length === 0 && thread.length === 0 ? (
            <div className="rounded-2xl bg-[var(--pv-surface)] px-4 py-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">🤖</span>
                <span className="text-sm font-medium text-[var(--pv-ink-faint)]">Pravnya</span>
              </div>
              <p className="text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">
                {goals === null
                  ? `Loading ${kidName}'s updates...`
                  : `Welcome! Ask me anything about ${kidName}, or tell me what you tried today.`}
              </p>
            </div>
          ) : null}

          {thread.map((message) => (
            <ThreadMessage key={message.id} message={message} />
          ))}
        </main>

        <footer className="border-t border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
            <form onSubmit={handleSend} className="flex flex-1 items-center gap-2 rounded-full border border-[var(--pv-border)] bg-[var(--pv-bg)] px-4 py-2.5">
              <input
                type="text"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder="Ask a question, or tell me what happened..."
                disabled={sending}
                className="min-w-0 flex-1 bg-transparent text-[0.95rem] text-[var(--pv-ink)] outline-none placeholder:text-[var(--pv-ink-faint)] disabled:opacity-60"
              />
              <button type="submit" disabled={sending || !composerText.trim()} className="flex-shrink-0 text-xs font-semibold text-[var(--pv-green-700)] disabled:text-[var(--pv-ink-faint)]">
                {sending ? "..." : "Send"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setView("logSession")}
              aria-label="Log with a photo or voice note"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[var(--pv-border)] bg-[var(--pv-bg)] text-[1.05rem] transition hover:border-[var(--pv-green-500)]"
            >
              📷
            </button>
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
            onClick={() => (tab.id === "goals" || tab.id === "growth" || tab.id === "activities") && setView(tab.id)}
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
