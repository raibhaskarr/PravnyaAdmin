import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, type SessionReport, type SessionStep, type TryMark } from "../api/client";
import { GuideHeader, useSpeaker, type Mood } from "./PravnyaGuide";

// A guided home session. For each activity Pravnya explains what to do (on screen and aloud),
// then the parent puts the phone down and plays with their child, then reports every try in one
// go: tap the grid, or just say or type "ball 2 of 3, cup with help" and check what Pravnya filled
// in. The therapist's plan decides every step on the server; typed or spoken replies are only
// interpreted there, never stored.

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

const MARKS: { mark: TryMark; symbol: string; label: string; cls: string }[] = [
  { mark: "none", symbol: "–", label: "not done", cls: "border-[var(--pv-border)] bg-[var(--pv-bg)] text-[var(--pv-ink-faint)]" },
  { mark: "own", symbol: "✓", label: "on their own", cls: "border-[var(--pv-green-700)] bg-[var(--pv-green-700)] text-white" },
  { mark: "help", symbol: "½", label: "with help", cls: "border-[var(--pv-orange-500)] bg-[var(--pv-orange-100)] text-[var(--pv-ink)]" },
  { mark: "notyet", symbol: "✗", label: "not yet", cls: "border-red-300 bg-red-50 text-red-700" }
];
const nextMark = (m: TryMark): TryMark => MARKS[(MARKS.findIndex((x) => x.mark === m) + 1) % MARKS.length].mark;
const markInfo = (m: TryMark) => MARKS.find((x) => x.mark === m)!;

function emptyReport(step: SessionStep): SessionReport {
  const r = step.report!;
  return { items: r.items.map((i) => ({ goalItemId: i.goalItemId, tries: Array<TryMark>(r.triesPerItem).fill("none") })), help: null };
}

/** Lays a drafted report onto the grid: one row per item, padded with "not done". */
function fillReport(step: SessionStep, draft: SessionReport): SessionReport {
  const r = step.report!;
  return {
    items: r.items.map((i) => {
      const tries = draft.items.find((x) => x.goalItemId === i.goalItemId)?.tries ?? [];
      return { goalItemId: i.goalItemId, tries: Array.from({ length: r.triesPerItem }, (_, n) => tries[n] ?? "none") };
    }),
    help: draft.help
  };
}

export function SessionRunner({
  token,
  kidId,
  kidName,
  sessionId,
  practiceLanguage,
  onClose
}: {
  token: string;
  kidId: string;
  kidName: string;
  /** A session the therapist set... */
  sessionId?: string;
  /** ...or a practice session Pravnya puts together now, in this language. */
  practiceLanguage?: "en" | "hi";
  onClose: () => void;
}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [step, setStep] = useState<SessionStep | null>(null);
  /** Between "let's start" and reporting: the phone is down, they're playing. */
  const [doing, setDoing] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [reply, setReply] = useState<string | null>(null);
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
  const speaker = useSpeaker(readAloud);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mainRef = useRef<HTMLElement>(null);
  // Hindi text read in a Hindi voice; everything else in Indian English.
  const voice = useRef("en-IN");

  // What's being read aloud, for the subtitles.
  const spoken = useRef<string[]>([]);
  function say(lines: string[]) {
    if (/[ऀ-ॿ]/.test(lines.join(""))) voice.current = "hi-IN";
    spoken.current = lines.filter(Boolean);
    speaker.speak(spoken.current, voice.current);
  }

  function show(next: SessionStep, said?: string | null) {
    setStep(next);
    setReply(said ?? null);
    setShowSteps(false);
    setText("");
    if (next.phase === "report") setReport(emptyReport(next));
    mainRef.current?.scrollTo?.({ top: 0 });
    // While they're playing, stay quiet; Pravnya speaks again on the report screen when they come back.
    if (next.phase !== "report") say([...(said ? [said] : []), ...next.lines]);
  }

  useEffect(() => {
    (practiceLanguage ? api.startPractice(token, kidId, practiceLanguage) : api.startSession(token, kidId, sessionId!))
      .then((r) => {
        setRunId(r.runId);
        setTitle(r.title);
        show(r.step);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't start the session. Try again."));
    // Start once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, kidId, sessionId, practiceLanguage]);

  async function turn(input: Parameters<typeof api.sessionTurn>[3]) {
    if (!runId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.sessionTurn(token, kidId, runId, input);
      const moved = res.step.phase !== step?.phase || res.step.activityLabel !== step?.activityLabel;
      if (moved) {
        if ("choice" in input && input.choice === "start") setDoing(true);
        else setDoing(false);
        show(res.step, res.reply);
      } else if (res.reply) {
        setReply(res.reply);
        say([res.reply]);
      }
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Typed or spoken: on the report screen it fills in the grid; elsewhere it's a reply or a question. */
  async function tell(input: { text: string } | { audio: { mimeType: string; base64: string } }) {
    if (step?.phase !== "report") return turn(input);
    if (!runId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.sessionReportDraft(token, kidId, runId, input);
      if (res.report) setReport(fillReport(step, res.report));
      setReply(res.reply);
      say([res.reply]);
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
    await tell({ text: t });
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    setError("");
    speaker.stop();
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
        if (blob.size) await tell({ audio: { mimeType: blob.type, base64: await readAsBase64(blob) } });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Couldn't use the microphone. Check the permission, or type or tap instead.");
    }
  }

  async function end() {
    speaker.stop();
    if (!runId) return onClose();
    if (step?.phase !== "done" && !window.confirm("End the session now? What you've reported so far is saved.")) return;
    try {
      const res = await api.endSession(token, kidId, runId);
      if (step?.phase !== "done" && res.summary) {
        setSummary(res.summary);
        setDoing(false);
        setStep((s) => (s ? { ...s, phase: "done", choices: [], lines: [] } : s));
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
    if (!next) speaker.stop();
    try {
      localStorage.setItem("pv.session.readAloud", next ? "on" : "off");
    } catch {
      // ignore
    }
  }

  function cycle(row: number, n: number) {
    setReport((r) => (r ? { ...r, items: r.items.map((it, i) => (i === row ? { ...it, tries: it.tries.map((m, j) => (j === n ? nextMark(m) : m)) } : it)) } : r));
  }
  function fillRow(row: number, mark: TryMark) {
    setReport((r) => (r ? { ...r, items: r.items.map((it, i) => (i === row ? { ...it, tries: it.tries.map(() => mark) } : it)) } : r));
  }

  const phase = step?.phase;
  const done = phase === "done";
  const pct = step && step.progress.total ? Math.round((step.progress.done / step.progress.total) * 100) : 0;
  const marked = report?.items.some((i) => i.tries.some((m) => m !== "none")) ?? false;
  const usedHelp = report?.items.some((i) => i.tries.includes("help")) ?? false;
  const mood: Mood = recording ? "listening" : speaker.speaking ? "talking" : done && summary ? "cheer" : "idle";

  // Subtitles while Pravnya talks; otherwise what she last said for this step.
  const subtitle = speaker.speaking && speaker.line >= 0 ? (spoken.current[speaker.line] ?? null) : null;
  const caption =
    subtitle ??
    reply ??
    (phase === "intro" || phase === "done" || (phase === "report" && !doing) ? step!.lines.join(" ") || null : phase === "explain" ? (step!.feedback ?? "Here's what to do. Tap ▶ to hear it.") : null);
  // Which part of the explain card is being read (its lines: [feedback], title, setup, say, counts, help, miss, reward, plan).
  const sections = ["title", "setup", "say", "counts", "help", "miss", "reward", "plan"];
  const lineInStep = step && speaker.line >= 0 ? speaker.line - (spoken.current.length - step.lines.length) - (step.feedback ? 1 : 0) : -1;
  const speakingSection = phase === "explain" && speaker.speaking ? (sections[lineInStep] ?? null) : null;

  const section = (id: string, icon: string, label: string, children: ReactNode) => (
    <div key={id} className={`rounded-xl px-3 py-2 transition ${speakingSection === id ? "bg-[var(--pv-green-100)] ring-2 ring-[var(--pv-green-500)]" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pv-ink-faint)]">
        <span aria-hidden="true">{icon}</span> {label}
      </p>
      <div className="mt-0.5 text-[1rem] leading-relaxed text-[var(--pv-ink)]">{children}</div>
    </div>
  );

  const guideCard = step?.guide ? (
    <div className="flex flex-col gap-1 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-2 shadow-sm">
      {section("setup", "🧺", "Get ready", step.guide.setup)}
      {section("say", "💬", "Each try", step.guide.say)}
      {section("counts", "✅", "It counts when", step.guide.countsWhen)}
      {section(
        "help",
        "🤝",
        "If they need help (least help first)",
        <ol className="list-decimal pl-5">
          {step.guide.helps.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      )}
      {section("miss", "🔁", "If they miss", step.guide.ifMiss)}
      {section("reward", "⭐", "Reward", step.guide.reward)}
      {section("plan", "🎯", "How many", `${step.guide.plan}. ${step.guide.moveOn}`)}
    </div>
  ) : null;

  const askBar = (placeholder: string, label: string) => (
    <form onSubmit={submitText} className="flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
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
          className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-lg ${recording ? "animate-pulse bg-red-600 text-white" : "border border-[var(--pv-border)] bg-[var(--pv-bg)]"}`}
        >
          {recording ? "■" : "🎤"}
        </button>
      )}
    </form>
  );

  const primary = "w-full rounded-2xl bg-[var(--pv-green-700)] px-5 py-3.5 text-[1.05rem] font-semibold text-white disabled:opacity-50";

  return (
    <div className="flex h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.02rem] font-semibold text-[var(--pv-ink)]">{title || "Session"}</p>
          <p className="text-xs text-[var(--pv-ink-faint)]">
            With {kidName}
            {step?.activityLabel && !done ? ` · ${step.activityLabel}` : " · Pravnya is guiding"}
          </p>
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

      <main ref={mainRef} className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {!step && !error ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <GuideHeader mood="talking" caption={practiceLanguage ? `Picking what to practise with ${kidName}...` : "Starting the session..."} />
          </div>
        ) : null}

        {phase === "intro" ? <GuideHeader mood={mood} caption={caption} onReplay={() => say(step!.lines)} /> : null}

        {phase === "explain" ? (
          <>
            <GuideHeader compact mood={mood} caption={caption} onReplay={() => say(step!.lines)} />
            <h2 className="text-[1.25rem] font-semibold text-[var(--pv-ink)]">{step!.activityTitle}</h2>
            {guideCard}
          </>
        ) : null}

        {phase === "report" && doing ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <GuideHeader mood="idle" caption={`Your turn! Put the phone down and play with ${kidName}. Come back when you're done.`} />
            <div className="w-full rounded-2xl border-2 border-[var(--pv-green-700)] bg-[var(--pv-surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pv-ink-faint)]">Practise</p>
              <p className="text-[1.6rem] font-semibold text-[var(--pv-ink)]">{step!.report!.items.map((i) => i.label).join(" · ")}</p>
              <p className="text-[var(--pv-ink-soft)]">{step!.guide?.plan}</p>
              <p className="mt-2 text-[0.98rem] text-[var(--pv-ink)]">💬 {step!.guide?.say}</p>
              <p className="text-[0.98rem] text-[var(--pv-ink)]">⭐ {step!.guide?.reward}</p>
            </div>
            <button type="button" className="text-sm font-semibold text-[var(--pv-green-700)]" onClick={() => setShowSteps((v) => !v)}>
              {showSteps ? "Hide the steps" : "See all the steps again"}
            </button>
            {showSteps ? guideCard : null}
          </div>
        ) : null}

        {phase === "report" && !doing && report ? (
          <>
            <GuideHeader compact mood={mood} caption={caption} onReplay={() => say(step!.lines)} />
            <div className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-4 shadow-sm">
              <p className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--pv-ink-soft)]">
                {MARKS.map((m) => (
                  <span key={m.mark}>
                    <span className={`mr-1 inline-flex h-5 w-5 items-center justify-center rounded-md border text-[0.7rem] ${m.cls}`}>{m.symbol}</span>
                    {m.label}
                  </span>
                ))}
              </p>
              <div className="flex flex-col gap-3">
                {step!.report!.items.map((item, row) => (
                  <div key={item.goalItemId} className="flex flex-wrap items-center gap-2">
                    <p className="w-24 flex-none truncate font-semibold text-[var(--pv-ink)]">{item.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {report.items[row].tries.map((m, n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => cycle(row, n)}
                          aria-label={`${item.label}, try ${n + 1}: ${markInfo(m).label}`}
                          className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 text-lg font-semibold ${markInfo(m).cls}`}
                        >
                          {markInfo(m).symbol}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => fillRow(row, "own")} className="ml-auto rounded-full px-2 py-1 text-xs font-semibold text-[var(--pv-green-700)]" aria-label={`${item.label}: all on their own`}>
                      All ✓
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--pv-ink-faint)]">Tap a box to change it.</p>
            </div>
            {usedHelp ? (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-[var(--pv-ink)]">What help did you mostly give?</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Help given">
                  {step!.report!.helps.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      role="radio"
                      aria-checked={report.help === h.id}
                      onClick={() => setReport({ ...report, help: report.help === h.id ? null : h.id })}
                      className={`rounded-full border px-3 py-1.5 text-sm ${report.help === h.id ? "border-[var(--pv-green-700)] bg-[var(--pv-green-100)] font-semibold" : "border-[var(--pv-border)] bg-[var(--pv-surface)]"}`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <button type="button" className="self-start text-sm font-semibold text-[var(--pv-green-700)]" onClick={() => setShowSteps((v) => !v)}>
              {showSteps ? "Hide the steps" : "See the steps again"}
            </button>
            {showSteps ? guideCard : null}
          </>
        ) : null}

        {done ? (
          <>
            <GuideHeader mood={mood} caption={caption} />
            {summary ? (
              <div className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-green-100)] px-4 py-3">
                <p className="whitespace-pre-line text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">{summary}</p>
                <p className="mt-2 text-sm text-[var(--pv-ink-soft)]">{practiceLanguage ? `Saved to ${kidName}'s progress, where your therapist can see it too.` : `Saved to ${kidName}'s progress, and sent to the therapist.`}</p>
              </div>
            ) : null}
          </>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </main>

      {step ? (
        <footer className="border-t border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {phase === "intro" ? (
              <button type="button" disabled={busy} className={primary} onClick={() => turn({ choice: "ready" })}>
                {step.choices[0]?.label ?? "We're ready"}
              </button>
            ) : null}
            {phase === "explain" ? (
              <>
                <button type="button" disabled={busy} className={primary} onClick={() => turn({ choice: "start" })}>
                  {step.choices.find((c) => c.id === "start")?.label ?? "Let's start"}
                </button>
                {askBar("Ask Pravnya about this activity...", "Ask Pravnya")}
                <button type="button" disabled={busy} className="self-center py-1 text-sm font-semibold text-[var(--pv-ink-soft)] disabled:opacity-50" onClick={() => turn({ choice: "skip" })}>
                  {step.choices.find((c) => c.id === "skip")?.label ?? "Skip this activity"}
                </button>
              </>
            ) : null}
            {phase === "report" && doing ? (
              <button
                type="button"
                className={primary}
                onClick={() => {
                  setDoing(false);
                  say(step.lines);
                }}
              >
                We're done, tell Pravnya how it went
              </button>
            ) : null}
            {phase === "report" && !doing && report ? (
              <>
                {askBar("Or say it: \"ball 2 of 3\"", "Tell Pravnya how it went")}
                <button type="button" disabled={busy || recording} className={primary} onClick={() => turn({ report })}>
                  {marked ? "Save and continue" : "We didn't do this one"}
                </button>
              </>
            ) : null}
            {recording ? <p className="text-center text-xs text-[var(--pv-ink-faint)]">Listening... tap ■ when you're done. Your voice isn't saved.</p> : null}
            {done ? (
              <button type="button" onClick={onClose} className={primary}>
                Done
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  );
}
