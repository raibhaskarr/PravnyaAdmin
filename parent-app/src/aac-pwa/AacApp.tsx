import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type AacBoard, type ParentProfile } from "../api/client";
import { clearStoredToken, getStoredToken, setStoredToken } from "../session";
import { Login } from "../auth/Login";
import { AacTalk } from "../aac/AacTalk";
import { loadBoardOffline, saveBoardOffline } from "../aac/shared";
import mark from "../brand/mark.svg";

// The talking board as its own PWA (served from aac.pravnya.com). Signs in once, remembers the
// kid, enters full-screen and keeps the screen on. The only way out is a 4-digit PIN the parent
// sets the first time they exit; the child can't close it by tapping around.

const PIN_KEY = "pv.aac.pin";
const KID_KEY = "pv.aac.kid";

function getStoredPin() {
  try {
    return localStorage.getItem(PIN_KEY) || null;
  } catch {
    return null;
  }
}
function setStoredPin(pin: string | null) {
  try {
    if (pin === null) localStorage.removeItem(PIN_KEY);
    else localStorage.setItem(PIN_KEY, pin);
  } catch {
    // ignore
  }
}
function getStoredKid() {
  try {
    return localStorage.getItem(KID_KEY) || null;
  } catch {
    return null;
  }
}
function setStoredKid(id: string | null) {
  try {
    if (id === null) localStorage.removeItem(KID_KEY);
    else localStorage.setItem(KID_KEY, id);
  } catch {
    // ignore
  }
}

/** Ask the browser for full-screen on the next user gesture (browsers refuse out-of-gesture). */
function useScreenLock(active: boolean) {
  const wakeRef = useRef<{ release(): Promise<void> } | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function get() {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
        wakeRef.current = (await wl?.request("screen")) ?? null;
      } catch {
        // No wake lock available; the screen will time out as usual.
      }
      if (cancelled) void wakeRef.current?.release();
    }
    void get();
    const vis = () => { if (document.visibilityState === "visible" && !wakeRef.current) void get(); };
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", vis);
      void wakeRef.current?.release();
      wakeRef.current = null;
    };
  }, [active]);

  const enterFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) return;
      await document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
    } catch {
      // ignore
    }
  }, []);
  return { enterFullscreen };
}

/** 4-digit PIN gate shown before exit. First use sets the PIN. */
function PinDialog({ mode, onDone, onCancel }: { mode: "set" | "check"; onDone: (pin: string) => void; onCancel: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState("");

  function submit() {
    setError("");
    if (!/^\d{4}$/.test(a)) return setError("PIN must be 4 digits.");
    if (mode === "set") {
      if (a !== b) return setError("The two PINs don't match.");
      onDone(a);
    } else {
      onDone(a);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-[var(--pv-surface)] p-5">
        <h2 className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">{mode === "set" ? "Set a PIN to exit" : "Enter your PIN to exit"}</h2>
        {mode === "set" ? <p className="text-sm text-[var(--pv-ink-soft)]">The child uses the board without a PIN; the PIN only locks the exit.</p> : null}
        <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoFocus value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-label="PIN" className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-3 text-center text-[1.4rem] tracking-[0.5em] font-semibold" />
        {mode === "set" ? (
          <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-label="Confirm PIN" placeholder="Confirm" className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-3 text-center text-[1.4rem] tracking-[0.5em] font-semibold" />
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-2xl border border-[var(--pv-border)] px-5 py-3 text-[0.98rem] font-semibold">Cancel</button>
          <button type="button" onClick={submit} className="flex-1 rounded-2xl bg-[var(--pv-green-700)] px-5 py-3 text-[0.98rem] font-semibold text-white">{mode === "set" ? "Set PIN" : "Exit"}</button>
        </div>
      </div>
    </div>
  );
}

export function AacApp() {
  const [token, setTokenState] = useState<string | null>(getStoredToken);
  const [profile, setProfile] = useState<ParentProfile | null>(null);
  const [kidId, setKidId] = useState<string | null>(getStoredKid);
  const [board, setBoard] = useState<AacBoard | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const { enterFullscreen } = useScreenLock(!!token && !!board);

  const onLoggedIn = (newToken: string) => {
    setStoredToken(newToken);
    setTokenState(newToken);
  };

  // Load profile and auto-pick the kid.
  useEffect(() => {
    if (!token) { setProfile(null); return; }
    void api.me(token).then((p) => {
      setProfile(p);
      const saved = getStoredKid();
      const next = p.kids?.find((k) => k.id === saved) ?? p.kids?.[0] ?? null;
      if (next) {
        setKidId(next.id);
        setStoredKid(next.id);
      }
    }).catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        clearStoredToken();
        setTokenState(null);
      } else {
        setError("Couldn't load the account. Check your internet.");
      }
    });
  }, [token]);

  // Fetch the board (or the cached offline copy) once we have a kid.
  useEffect(() => {
    if (!token || !kidId) return;
    setBoard(undefined);
    api.getAacBoard(token, kidId).then(({ board }) => {
      setBoard(board);
      if (board) saveBoardOffline(kidId, board);
    }).catch(() => {
      // Offline: fall back to the cached copy if we have one.
      setBoard(loadBoardOffline(kidId));
    });
  }, [token, kidId]);

  function handleExit() {
    if (!getStoredPin()) {
      setPinOpen(true);
      return;
    }
    setPinOpen(true);
  }

  function onPin(entered: string) {
    const existing = getStoredPin();
    if (!existing) {
      setStoredPin(entered);
      setPinOpen(false);
      // Don't actually exit yet -- the parent set the PIN, so they probably meant to; close PWA cleanly.
      try { window.close(); } catch { /* ignore */ }
    } else {
      if (entered !== existing) {
        // Shake and stay; PinDialog shows its own error.
        return;
      }
      setPinOpen(false);
      try { window.close(); } catch { /* ignore */ }
    }
  }

  if (!token) {
    return <Login onBack={() => setTokenState(null)} onLoggedIn={onLoggedIn} onForgotPassword={() => {/* link to app.pravnya.com */}} onCreateAccount={() => { window.location.href = "https://app.pravnya.com/?auth=create"; }} />;
  }

  if (!profile || board === undefined) {
    return <div className="flex h-dvh items-center justify-center bg-[var(--pv-bg)] text-[var(--pv-ink-faint)]"><img src={mark} alt="" className="h-12 w-12 animate-pulse" /></div>;
  }

  if (!profile.kids || profile.kids.length === 0) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[var(--pv-bg)] p-6 text-center">
        <p className="text-[var(--pv-ink)]">No child on this account yet.</p>
        <a href="https://app.pravnya.com" className="font-semibold text-[var(--pv-green-700)]">Open Pravnya</a>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[var(--pv-bg)] p-6 text-center">
        <p className="text-[var(--pv-ink)]">No talking board set up for {profile.kids.find((k) => k.id === kidId)?.firstName ?? "this child"} yet.</p>
        <a href="https://app.pravnya.com" className="font-semibold text-[var(--pv-green-700)]">Set it up in the main app</a>
        <KidPicker profile={profile} selected={kidId} onPick={(id) => { setKidId(id); setStoredKid(id); }} />
      </div>
    );
  }

  // Many browsers only allow fullscreen on a user tap; wrap the Talk screen in a one-time overlay.
  return (
    <>
      {profile.kids.length > 1 && !document.fullscreenElement ? (
        <KidPickerBar profile={profile} selected={kidId} onPick={(id) => { setKidId(id); setStoredKid(id); setBoard(undefined); }} />
      ) : null}
      <AacTalk board={board} token={token} kidId={board.kidId} onClose={handleExit} />
      <button type="button" onClick={enterFullscreen} className="fixed bottom-2 right-2 z-40 rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur" aria-label="Full screen">
        ⛶ Full
      </button>
      {pinOpen ? (
        <PinDialog
          mode={getStoredPin() ? "check" : "set"}
          onDone={onPin}
          onCancel={() => setPinOpen(false)}
        />
      ) : null}
      {error ? <p className="fixed left-2 top-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    </>
  );
}

function KidPicker({ profile, selected, onPick }: { profile: ParentProfile; selected: string | null; onPick: (id: string) => void }) {
  const kids = profile.kids ?? [];
  if (kids.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-sm text-[var(--pv-ink-faint)]">Switch child:</span>
      {kids.map((k) => (
        <button key={k.id} type="button" onClick={() => onPick(k.id)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${k.id === selected ? "border-[var(--pv-green-700)] bg-[var(--pv-green-100)]" : "border-[var(--pv-border)] bg-[var(--pv-surface)]"}`}>
          {k.firstName}
        </button>
      ))}
    </div>
  );
}

/** A one-row kid switcher shown briefly on top of the talking board when there are multiple kids. */
function KidPickerBar({ profile, selected, onPick }: { profile: ParentProfile; selected: string | null; onPick: (id: string) => void }) {
  const kids = profile.kids ?? [];
  return (
    <div className="pointer-events-auto fixed left-1/2 top-2 z-40 flex -translate-x-1/2 gap-2 rounded-full bg-black/40 px-2 py-1 backdrop-blur">
      {kids.map((k) => (
        <button key={k.id} type="button" onClick={() => onPick(k.id)} className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${k.id === selected ? "bg-white/30" : ""}`}>
          {k.firstName}
        </button>
      ))}
    </div>
  );
}
