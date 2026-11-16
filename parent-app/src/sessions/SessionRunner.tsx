import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, type SessionStep } from "../api/client";
import mark from "../brand/mark.svg";

// A guided home session, like a call with a therapist: Pravnya says each step (and can read it
// aloud), the parent answers by tapping, typing or speaking. The therapist's plan decides every
// step on the server; typed or spoken replies are only interpreted there, never stored.

type Bubble = { from: "pravnya" | "parent"; text: string };

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function speak(lines: string[], language: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(lines.join(" "));
    u.lang = language;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    // Reading aloud is a nice-to-have; the text is always on screen.
  }
}

function stepText(step: SessionStep) {
  return step.lines.filter(Boolean);
}

export function SessionRunner({
  token,
  kidId,
  kidName,
  sessionId,
  onClose
}: {
  token: string;
  kidId: string;
  kidName: string;
  sessionId: string;
  onClose: () => void;
}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [step, setStep] = useState<SessionStep | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [readAloud, setReadAloud] = useState(() => {
    try {
      return localStorage.getItem("pv.session.readAloud") !== "off";
    } catch {
      return true;
    }
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  // Hindi text read in a Hindi voice; everything else in Indian English.
  const voice = useRef("en-IN");

  function show(next: SessionStep, reply?: string | null, parentText?: string) {
    const lines = stepText(next);
    setBubbles((b) => [...b, ...(parentText ? [{ from: "parent" as const, text: parentText }] : []), ...(reply ? [{ from: "pravnya" as const, text: reply }] : []), { from: "pravnya", text: lines.join("\n") }]);
    setStep(next);
    if (/[ऀ-ॿ]/.test(lines.join(""))) voice.current = "hi-IN";
    if (readAloud) speak([...(reply ? [reply] : []), ...lines], voice.current);
  }

  useEffect(() => {
    api
      .startSession(token, kidId, sessionId)
      .then((r) => {
        setRunId(r.runId);
        setTitle(r.title);
        show(r.step);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't start the session. Try again."));
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    };
    // Start once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, kidId, sessionId]);

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [bubbles.length, summary]);

  async function send(input: { choice: string } | { text: string } | { audio: { mimeType: string; base64: string } }, parentText: string) {
    if (!runId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.sessionTurn(token, kidId, runId, input);
      const changed = res.step.phase !== step?.phase || res.step.progress.done !== step?.progress.done || res.step.lines.join() !== step?.lines.join();
      if (changed) show(res.step, res.reply, parentText);
      else {
        setBubbles((b) => [...b, { from: "parent", text: parentText }, ...(res.reply ? [{ from: "pravnya" as const, text: res.reply }] : [])]);
        if (readAloud && res.reply) speak([res.reply], voice.current);
      }
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitText(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    await send({ text: t }, t);
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) await send({ audio: { mimeType: blob.type, base64: await readAsBase64(blob) } }, "🎤 (voice reply)");
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Couldn't use the microphone. Check the permission, or type or tap instead.");
    }
  }

  async function end() {
    if (!runId) return onClose();
    if (step?.phase !== "done" && !window.confirm("End the session now? What you've done so far is saved.")) return;
    try {
      const res = await api.endSession(token, kidId, runId);
      if (step?.phase !== "done" && res.summary) {
        setSummary(res.summary);
        setStep((s) => (s ? { ...s, phase: "done", choices: [] } : s));
        return;
      }
    } catch {
      // Ending is best-effort; the run is closed on the next start anyway.
    }
    onClose();
  }

  function toggleReadAloud() {
    const next = !readAloud;
    setReadAloud(next);
    try {
      localStorage.setItem("pv.session.readAloud", next ? "on" : "off");
      if (!next) window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
  }

  const done = step?.phase === "done";
  const pct = step && step.progress.total ? Math.round((step.progress.done / step.progress.total) * 100) : 0;

  return (
    <div className="flex h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.02rem] font-semibold text-[var(--pv-ink)]">{title || "Session"}</p>
          <p className="text-xs text-[var(--pv-ink-faint)]">With {kidName} · Pravnya is guiding</p>
        </div>
        <button type="button" onClick={toggleReadAloud} aria-pressed={readAloud} className="rounded-full border border-[var(--pv-border)] px-3 py-1.5 text-sm text-[var(--pv-ink-soft)]">
          {readAloud ? "🔊 On" : "🔇 Off"}
        </button>
        <button type="button" onClick={end} className="rounded-full bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white">
          {done ? "Close" : "End"}
        </button>
      </header>
      {step ? (
        <div className="h-1.5 w-full bg-[var(--pv-border)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Session progress">
          <div className="h-full bg-[var(--pv-green-700)] transition-all" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {!step && !error ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <img src={mark} alt="" className="h-8 w-8 animate-pulse opacity-60" />
            <p className="text-sm text-[var(--pv-ink-faint)]">Starting the session...</p>
          </div>
        ) : null}
        {bubbles.map((b, i) =>
          b.from === "pravnya" ? (
            <div key={i} className="max-w-[92%] self-start rounded-2xl rounded-tl-sm bg-[var(--pv-surface)] px-4 py-3 shadow-sm">
              <p className="mb-0.5 text-xs font-semibold text-[var(--pv-green-700)]">Pravnya</p>
              <p className="whitespace-pre-line text-[1rem] leading-relaxed text-[var(--pv-ink)]">{b.text}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-[var(--pv-green-700)] px-4 py-2.5 text-[0.98rem] text-white">
              {b.text}
            </div>
          )
        )}
        {step?.item && (step.phase === "trial" || step.phase === "help") ? (
          <div className="self-center rounded-2xl border-2 border-[var(--pv-green-700)] bg-[var(--pv-surface)] px-8 py-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pv-ink-faint)]">Now practising</p>
            <p className="text-[1.8rem] font-semibold text-[var(--pv-ink)]">{step.item}</p>
          </div>
        ) : null}
        {summary ? (
          <div className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-green-100)] px-4 py-3">
            <p className="whitespace-pre-line text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">{summary}</p>
            <p className="mt-2 text-sm text-[var(--pv-ink-soft)]">Saved to {kidName}'s progress, and sent to the therapist.</p>
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div ref={endRef} />
      </main>

      {step && !done ? (
        <footer className="border-t border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {step.choices.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => send({ choice: c.id }, c.label)}
                  className={`rounded-2xl px-4 py-2.5 text-[0.98rem] font-semibold transition disabled:opacity-50 ${
                    i === 0 ? "bg-[var(--pv-green-700)] text-white" : "border border-[var(--pv-border)] bg-[var(--pv-bg)] text-[var(--pv-ink)]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <form onSubmit={submitText} className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Or tell Pravnya what happened, or ask..."
                aria-label="Tell Pravnya what happened"
                className="min-w-0 flex-1 rounded-full border border-[var(--pv-border)] bg-[var(--pv-bg)] px-4 py-2.5 text-[0.98rem] text-[var(--pv-ink)] outline-none focus:border-[var(--pv-green-500)]"
              />
              {text.trim() ? (
                <button type="submit" disabled={busy} className="rounded-full bg-[var(--pv-green-700)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  Send
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={busy && !recording}
                  aria-label={recording ? "Stop and send" : "Answer by voice"}
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-lg ${recording ? "animate-pulse bg-red-600 text-white" : "border border-[var(--pv-border)] bg-[var(--pv-bg)]"}`}
                >
                  {recording ? "■" : "🎤"}
                </button>
              )}
            </form>
            {recording ? <p className="text-center text-xs text-[var(--pv-ink-faint)]">Listening... tap ■ when you're done. Your voice isn't saved.</p> : null}
          </div>
        </footer>
      ) : done ? (
        <footer className="border-t border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={onClose} className="mx-auto block w-full max-w-2xl rounded-2xl bg-[var(--pv-green-700)] px-5 py-3.5 text-[1.05rem] font-semibold text-white">
            Done
          </button>
        </footer>
      ) : null}
    </div>
  );
}
