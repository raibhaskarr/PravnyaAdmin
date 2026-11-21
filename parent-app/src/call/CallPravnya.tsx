import { useEffect, useRef, useState } from "react";
import { api, ApiError, type SessionReport, type SessionStep, type TryMark } from "../api/client";
import { PravnyaFace } from "../sessions/PravnyaGuide";
import { startMic, VoicePlayer, type Mic } from "./audio";
import { emptyTally, runTool, type Tally } from "./callTools";
import { connectLive, type LiveCall } from "./liveClient";

// "Call Pravnya": the home session as a hands-free voice call. The phone is propped up; Pravnya
// explains each activity, listens while the parent and child play, counts the tries as the parent
// says them, reads the tally back and saves it. Speech goes straight to the voice model and back;
// nothing is recorded or stored. The session's plan and the server still decide every step.

type Status = "idle" | "connecting" | "live" | "dropped" | "ended";

const MARK: Record<TryMark, { symbol: string; cls: string }> = {
  none: { symbol: "–", cls: "border-[var(--pv-border)] text-[var(--pv-ink-faint)]" },
  own: { symbol: "✓", cls: "border-[var(--pv-green-700)] bg-[var(--pv-green-700)] text-white" },
  help: { symbol: "½", cls: "border-[var(--pv-orange-500)] bg-[var(--pv-orange-100)] text-[var(--pv-ink)]" },
  notyet: { symbol: "✗", cls: "border-red-300 bg-red-50 text-red-700" }
};

function mmss(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CallPravnya({
  token,
  kidId,
  kidName,
  runId,
  title,
  initialTally,
  onExit
}: {
  token: string;
  kidId: string;
  kidName: string;
  runId: string;
  title: string;
  /** Tries already marked on the screens for the activity being played. */
  initialTally?: SessionReport | null;
  /** Back to the screens, with any tries counted on the call that aren't saved yet. */
  onExit: (unsaved: SessionReport | null) => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [step, setStep] = useState<SessionStep | null>(null);
  const [tally, setTally] = useState<Tally | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [heard, setHeard] = useState("");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [talking, setTalking] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const call = useRef<LiveCall | null>(null);
  const mic = useRef<Mic | null>(null);
  const player = useRef<VoicePlayer | null>(null);
  const contexts = useRef<AudioContext[]>([]);
  const wakeLock = useRef<{ release(): Promise<void> } | null>(null);
  const stepRef = useRef<SessionStep | null>(null);
  const tallyRef = useRef<Tally | null>(null);
  const finished = useRef(false);
  const hungUp = useRef(false);
  const newTurn = useRef({ said: true, heard: true });
  const toolQueue = useRef(Promise.resolve());

  function setStepBoth(s: SessionStep) {
    stepRef.current = s;
    setStep(s);
  }
  function setTallyBoth(t: Tally | null) {
    tallyRef.current = t;
    setTally(t);
  }

  function hangUp() {
    hungUp.current = true;
    call.current?.close();
    call.current = null;
    mic.current?.stop();
    mic.current = null;
    player.current?.interrupt();
    contexts.current.forEach((c) => void c.close().catch(() => {}));
    contexts.current = [];
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }

  useEffect(() => hangUp, []);

  // The face's mouth follows Pravnya's voice; the call timer ticks while live.
  useEffect(() => {
    if (status !== "live") return;
    let raf = 0;
    let last = 0;
    const tick = () => {
      const p = player.current;
      const speaking = !!p?.speaking;
      setTalking(speaking);
      const l = speaking ? p!.level() : 0;
      if (Math.abs(l - last) > 0.04) {
        last = l;
        setLevel(l);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, [status]);

  function finishWhenQuiet() {
    // Let Pravnya say goodbye, then hang up (or after 20 seconds whatever happens).
    const started = Date.now();
    const wait = setInterval(() => {
      if ((!player.current?.speaking && Date.now() - started > 2500) || Date.now() - started > 20_000) {
        clearInterval(wait);
        hangUp();
        setStatus("ended");
      }
    }, 500);
  }

  async function handleTools(calls: { id: string; name: string; args: Record<string, unknown> }[]) {
    const responses = [];
    for (const c of calls) {
      const out = await runTool(c.name, c.args, { token, kidId, runId, step: stepRef.current!, tally: tallyRef.current });
      if (out.step) setStepBoth(out.step);
      if (out.tally !== undefined) setTallyBoth(out.tally);
      if (out.summary) setSummary(out.summary);
      if (out.finished) finished.current = true;
      responses.push({ id: c.id, name: c.name, response: out.response });
    }
    call.current?.sendToolResponses(responses);
  }

  async function start() {
    setError("");
    hungUp.current = false;
    // Audio has to be set up inside the tap that starts the call.
    const micCtx = new AudioContext({ sampleRate: 16_000 });
    const outCtx = new AudioContext({ sampleRate: 24_000 });
    contexts.current = [micCtx, outCtx];
    player.current = new VoicePlayer(outCtx);
    setStatus("connecting");
    try {
      const t = await api.startCall(token, kidId, runId);
      setStepBoth(t.step);
      const fresh = emptyTally(t.step);
      const carried = tallyRef.current?.report ?? initialTally;
      setTallyBoth(fresh && carried && carried.items.length === fresh.report.items.length ? { report: carried, history: [] } : fresh);

      call.current = await connectLive(t, {
        onOpen: () => {},
        onAudio: (b64, mime) => player.current?.play(b64, mime),
        onPravnyaText: (piece) => {
          setSaid((s) => (newTurn.current.said ? piece : s + piece).slice(-400));
          newTurn.current.said = false;
        },
        onParentText: (piece) => {
          setHeard((s) => (newTurn.current.heard ? piece : s + piece).slice(-200));
          newTurn.current.heard = false;
        },
        onInterrupted: () => player.current?.interrupt(),
        onTurnComplete: () => {
          newTurn.current = { said: true, heard: true };
          if (finished.current) finishWhenQuiet();
        },
        onToolCall: (calls) => {
          toolQueue.current = toolQueue.current.then(() => handleTools(calls));
        },
        onClose: () => {
          if (hungUp.current) return;
          hangUp();
          setStatus(finished.current ? "ended" : "dropped");
        }
      });

      mic.current = await startMic(micCtx, (chunk) => call.current?.sendAudio(chunk));
      try {
        wakeLock.current = (await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        // Keeping the screen on is a nice-to-have.
      }
      setStatus("live");
      setSeconds(0);
      const marked = tallyRef.current?.report.items.some((i) => i.tries.some((m) => m !== "none"));
      call.current.sendText(
        `(The parent has joined the call${marked ? `. Already marked for this activity: ${JSON.stringify(tallyRef.current!.report.items)}` : ""}. Please start.)`
      );
    } catch (err) {
      hangUp();
      setStatus("idle");
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof DOMException && err.name === "NotAllowedError"
            ? "Pravnya can't use the microphone. Allow it in your phone's settings, then try again."
            : "The call couldn't connect. Check your internet, or carry on with the screens."
      );
    }
  }

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    mic.current?.setMuted(m);
  }

  function leave() {
    if (status === "live" && !finished.current && !window.confirm("Hang up? The session stays open: you can carry on with the screens.")) return;
    hangUp();
    const unsaved = tallyRef.current?.report ?? null;
    onExit(unsaved && unsaved.items.some((i) => i.tries.some((m) => m !== "none")) ? unsaved : null);
  }

  const mood = muted ? "idle" : talking ? "talking" : status === "live" ? "listening" : status === "ended" ? "cheer" : "idle";

  return (
    <div className="flex h-dvh flex-col bg-gradient-to-b from-[var(--pv-green-900)] to-[var(--pv-green-700)] text-white">
      <header className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.02rem] font-semibold">{title}</p>
          <p className="text-xs text-white/70" aria-live="polite">
            {status === "idle"
              ? `Call Pravnya · with ${kidName}`
              : status === "connecting"
                ? "Connecting..."
                : status === "live"
                  ? `${talking ? "Pravnya is talking" : muted ? "You're muted" : "Listening"} · ${mmss(seconds)}`
                  : status === "dropped"
                    ? "The call dropped"
                    : "Call ended"}
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-5 py-4">
        <PravnyaFace mood={mood} size={status === "idle" ? 150 : 170} mouthLevel={status === "live" ? level : undefined} />

        {status === "idle" ? (
          <>
            <h2 className="text-center text-[1.35rem] font-semibold">Talk it through with Pravnya, hands-free</h2>
            <ul className="w-full space-y-2 rounded-2xl bg-white/10 px-4 py-3 text-[0.98rem]">
              <li>📱 Prop the phone up near you, screen facing you.</li>
              <li>🔊 Turn the volume up. A quiet room helps.</li>
              <li>🗣️ Pravnya explains each activity. Just tell her how each try goes: "got it", "no", "with help".</li>
              <li>🔒 Your voice isn't recorded or saved.</li>
            </ul>
          </>
        ) : null}

        {status === "connecting" || status === "live" ? (
          <>
            <div className="min-h-[4.5rem] w-full rounded-2xl bg-white/10 px-4 py-3 text-center text-[1.05rem] leading-relaxed" aria-live="polite">
              {said || (status === "connecting" ? "Calling Pravnya..." : "...")}
            </div>
            {heard ? <p className="w-full text-center text-sm text-white/70">You: {heard}</p> : null}
          </>
        ) : null}

        {step && (status === "live" || status === "dropped") && step.activityTitle ? (
          <div className="w-full rounded-2xl bg-white/95 px-4 py-3 text-[var(--pv-ink)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pv-ink-faint)]">{step.activityLabel}</p>
            <p className="font-semibold">{step.activityTitle}</p>
            {step.phase === "report" && tally ? (
              <div className="mt-2 flex flex-col gap-1.5" aria-label="Tries so far">
                {step.report!.items.map((item, row) => (
                  <div key={item.goalItemId} className="flex items-center gap-2">
                    <span className="w-20 truncate text-sm font-semibold">{item.label}</span>
                    {tally.report.items[row].tries.map((m, n) => (
                      <span
                        key={n}
                        aria-label={`${item.label}, try ${n + 1}: ${m}`}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 text-sm font-semibold ${MARK[m].cls}`}
                      >
                        {MARK[m].symbol}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            ) : step.guide ? (
              <p className="mt-1 text-sm text-[var(--pv-ink-soft)]">💬 {step.guide.say}</p>
            ) : null}
          </div>
        ) : null}

        {status === "dropped" ? <p className="text-center">The call dropped. Nothing saved is lost: reconnect, or carry on with the screens.</p> : null}
        {status === "ended" ? (
          <div className="w-full rounded-2xl bg-white/95 px-4 py-3 text-[var(--pv-ink)]">
            <p className="whitespace-pre-line text-[0.98rem] leading-relaxed">{summary ?? "Call ended."}</p>
            {summary ? <p className="mt-2 text-sm text-[var(--pv-ink-soft)]">Saved to {kidName}'s progress.</p> : null}
          </div>
        ) : null}
        {error ? <p className="w-full rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </main>

      <footer className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          {status === "idle" || status === "dropped" ? (
            <>
              <button type="button" onClick={start} className="w-full rounded-2xl bg-white px-5 py-3.5 text-[1.05rem] font-semibold text-[var(--pv-green-900)]">
                {status === "dropped" ? "Reconnect" : "📞 Start call"}
              </button>
              <button type="button" onClick={leave} className="w-full py-2 text-[0.98rem] font-semibold text-white/85">
                Back to the screens
              </button>
            </>
          ) : status === "ended" ? (
            <button type="button" onClick={leave} className="w-full rounded-2xl bg-white px-5 py-3.5 text-[1.05rem] font-semibold text-[var(--pv-green-900)]">
              Done
            </button>
          ) : (
            <div className="flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={toggleMute}
                disabled={status !== "live"}
                aria-pressed={muted}
                aria-label={muted ? "Unmute" : "Mute"}
                className={`flex h-14 w-14 items-center justify-center rounded-full text-xl disabled:opacity-50 ${muted ? "bg-white text-[var(--pv-green-900)]" : "bg-white/15"}`}
              >
                {muted ? "🔇" : "🎤"}
              </button>
              <button type="button" onClick={leave} aria-label="Hang up" className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl shadow-lg">
                📞
              </button>
              <button type="button" onClick={leave} aria-label="Switch to the screens" className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-xl">
                📋
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
