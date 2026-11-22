import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, assetUrl, type ScheduleFields, type ScheduleKind, type SchedulePicture, type ScheduleTemplate, type SymbolResult, type VisualScheduleStep } from "../api/client";
import { shrinkPhoto } from "../log/shrinkPhoto";
import { SYMBOL_CREDIT } from "./VisualSchedules";

// The parent makes a picture schedule: they describe it (typed, or said out loud), Pravnya drafts
// the steps and pictures, they check and change it, and save. The same editor changes a schedule
// they made, or just the time and reminder of one their therapist made.

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KINDS: { value: ScheduleKind; label: string }[] = [
  { value: "ROUTINE", label: "Routine (steps of one activity)" },
  { value: "FIRST_THEN", label: "First / Then (task, then reward)" },
  { value: "DAY", label: "Day plan" }
];
const MAX_STEPS: Record<ScheduleKind, number> = { FIRST_THEN: 2, ROUTINE: 12, DAY: 16 };

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

const newStep = (label = ""): VisualScheduleStep => ({ key: crypto.randomUUID(), label, say: null, picture: null, minutes: null });

function Screen({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
        <button type="button" onClick={onBack} aria-label="Back" className="rounded-full p-1 text-[var(--pv-ink-soft)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <p className="min-w-0 flex-1 truncate text-[1.05rem] font-semibold text-[var(--pv-ink)]">{title}</p>
      </header>
      <main className="mx-auto w-full max-w-2xl min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</main>
    </div>
  );
}

const input = "w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-3 py-2 text-[0.95rem] text-[var(--pv-ink)]";
const label = "text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]";

export function PicturePicker({ token, kidId, initialQuery, onPick, onClose }: { token: string; kidId: string; initialQuery: string; onPick: (p: SchedulePicture | null) => void; onClose: () => void }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.searchSymbols(token, kidId, query).then((r) => setResults(r.symbols)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, token, kidId]);

  async function upload(file: File) {
    setError("");
    setBusy(true);
    try {
      const photo = await shrinkPhoto(file);
      const { id, url } = await api.uploadPicture(token, kidId, await readAsBase64(photo));
      onPick({ kind: "photo", mediaId: id, url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-label="Choose a picture">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 rounded-t-3xl bg-[var(--pv-surface)] p-4 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">Choose a picture</p>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-[var(--pv-ink-soft)]">
            Close
          </button>
        </div>
        <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. brush teeth" aria-label="Search pictures" autoFocus />
        <div className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex-1 rounded-xl border border-[var(--pv-green-700)] px-3 py-2 text-sm font-semibold text-[var(--pv-green-700)]">
            {busy ? "Adding..." : "📷 Use a photo"}
          </button>
          <button type="button" onClick={() => onPick(null)} className="rounded-xl border border-[var(--pv-border)] px-3 py-2 text-sm text-[var(--pv-ink-soft)]">
            No picture
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <p className="text-xs text-[var(--pv-ink-faint)]">A photo of {`your child's`} own things (their toothbrush, their school) often works best.</p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="grid min-h-0 grid-cols-3 gap-2 overflow-y-auto">
          {results.map((s) => (
            <button key={s.id} type="button" onClick={() => onPick({ kind: "symbol", symbolId: s.id, url: s.url })} className="flex flex-col items-center gap-1 rounded-xl border border-[var(--pv-border)] bg-white p-2">
              <img src={s.url} alt="" loading="lazy" className="h-16 w-16 object-contain" />
              <span className="text-xs text-[var(--pv-ink-soft)]">{s.label}</span>
            </button>
          ))}
        </div>
        {q.trim() && results.length === 0 ? <p className="text-sm text-[var(--pv-ink-faint)]">No pictures found. Try a simpler word, in English.</p> : null}
        <p className="text-[0.65rem] text-[var(--pv-ink-faint)]">{SYMBOL_CREDIT}</p>
      </div>
    </div>
  );
}

/** Edits a schedule. With timingOnly, only when it's done and the reminder (a therapist's schedule). */
export function ScheduleEditor({
  token,
  kidId,
  title: screenTitle,
  initial,
  timingOnly = false,
  learnedTime,
  saveLabel,
  onSave,
  onDelete,
  onCancel
}: {
  token: string;
  kidId: string;
  title: string;
  initial: ScheduleFields;
  timingOnly?: boolean;
  /** Shown when no time is set: the one learned from use. */
  learnedTime?: string | null;
  saveLabel: string;
  onSave: (fields: ScheduleFields) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<ScheduleFields>(initial);
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<ScheduleFields>) => setF((x) => ({ ...x, ...patch }));
  const setStep = (i: number, s: VisualScheduleStep) => set({ steps: f.steps.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, dir: -1 | 1) => {
    const steps = [...f.steps];
    [steps[i], steps[i + dir]] = [steps[i + dir], steps[i]];
    set({ steps });
  };
  const max = MAX_STEPS[f.kind];
  const countOk = f.kind === "FIRST_THEN" ? f.steps.length === 2 : f.steps.length >= 2 && f.steps.length <= max;
  const head = (i: number) => (f.kind === "FIRST_THEN" ? (i === 0 ? "First" : "Then") : `${i + 1}`);

  async function save() {
    setError("");
    if (!timingOnly && (!f.title.trim() || f.steps.some((s) => !s.label.trim()))) return setError("Give the schedule a name, and every step a label.");
    if (!timingOnly && !countOk) return setError(f.kind === "FIRST_THEN" ? "First / Then has exactly 2 steps." : `Use 2 to ${max} steps.`);
    setBusy(true);
    try {
      await onSave(f);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <Screen title={screenTitle} onBack={onCancel}>
      <div className="flex flex-col gap-5">
        {!timingOnly ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={label}>Name</span>
              <input className={input} value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={label}>Kind</span>
              <select className={input} value={f.kind} onChange={(e) => set({ kind: e.target.value as ScheduleKind })}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <section className="flex flex-col gap-2">
              <span className={label}>Steps</span>
              {f.steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-2">
                  <span className="w-10 text-center text-sm font-bold text-[var(--pv-ink-soft)]">{head(i)}</span>
                  <button type="button" onClick={() => setPicking(i)} aria-label={`Picture for step ${i + 1}`} className="flex-shrink-0">
                    {s.picture ? (
                      <img src={assetUrl(s.picture.url)} alt="" className="h-14 w-14 rounded-lg bg-white object-contain" />
                    ) : (
                      <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-[var(--pv-border)] text-xs text-[var(--pv-ink-faint)]">+ Picture</span>
                    )}
                  </button>
                  <input className={`${input} min-w-0 flex-1`} value={s.label} onChange={(e) => setStep(i, { ...s, label: e.target.value })} placeholder="Label" aria-label={`Step ${i + 1} label`} maxLength={60} />
                  <div className="flex flex-col">
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="px-1 text-[var(--pv-ink-soft)] disabled:opacity-30">
                      ▲
                    </button>
                    <button type="button" disabled={i === f.steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="px-1 text-[var(--pv-ink-soft)] disabled:opacity-30">
                      ▼
                    </button>
                  </div>
                  {f.steps.length > 2 ? (
                    <button type="button" onClick={() => set({ steps: f.steps.filter((_, j) => j !== i) })} aria-label={`Remove step ${i + 1}`} className="px-1 text-red-600">
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
              {f.steps.length < max ? (
                <button type="button" onClick={() => set({ steps: [...f.steps, newStep()] })} className="self-start text-sm font-semibold text-[var(--pv-green-700)]">
                  + Add a step
                </button>
              ) : null}
            </section>
            <section className="flex flex-col gap-1.5">
              <span className={label}>Days</span>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => {
                  const on = f.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ days: on ? f.days.filter((x) => x !== d) : DAYS.filter((x) => x === d || f.days.includes(x)) })}
                      className={`rounded-full border px-3 py-1 text-sm ${on ? "border-[var(--pv-green-700)] bg-[var(--pv-green-700)] text-white" : "border-[var(--pv-border)] text-[var(--pv-ink-soft)]"}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-[var(--pv-ink-faint)]">None picked: any day.</span>
            </section>
          </>
        ) : null}
        <section className="flex flex-col gap-1.5">
          <span className={label}>Usual time</span>
          <input type="time" className={input} value={f.time ?? ""} onChange={(e) => set({ time: e.target.value || null })} aria-label="Usual time" />
          <span className="text-xs text-[var(--pv-ink-faint)]">
            {f.time ? "It shows first on Home around this time." : learnedTime ? `Not set: Pravnya noticed you usually open it around ${learnedTime}.` : "Leave empty and Pravnya learns it from when you open the schedule."}
          </span>
        </section>
        <label className="flex items-center gap-2 text-[0.95rem] text-[var(--pv-ink)]">
          <input type="checkbox" checked={f.remind} onChange={(e) => set({ remind: e.target.checked })} className="h-5 w-5" />
          Remind me when it's time
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="button" onClick={save} disabled={busy} className="rounded-2xl bg-[var(--pv-green-700)] px-4 py-3 text-[1rem] font-semibold text-white disabled:opacity-60">
          {busy ? "Saving..." : saveLabel}
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Delete this schedule?")) return;
              setBusy(true);
              try {
                await onDelete();
              } catch {
                setError("Couldn't delete. Try again.");
                setBusy(false);
              }
            }}
            className="text-sm font-semibold text-red-600"
          >
            Delete this schedule
          </button>
        ) : null}
      </div>
      {picking !== null ? (
        <PicturePicker
          token={token}
          kidId={kidId}
          initialQuery={f.language === "en" ? f.steps[picking].label : ""}
          onClose={() => setPicking(null)}
          onPick={(p) => {
            setStep(picking, { ...f.steps[picking], picture: p });
            setPicking(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

/** Describe it -> Pravnya drafts it -> check and save. */
export function ScheduleMaker({ token, kidId, kidName, onSaved, onCancel }: { token: string; kidId: string; kidName: string; onSaved: () => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [draft, setDraft] = useState<ScheduleFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);

  useEffect(() => {
    api
      .listScheduleTemplates(token, kidId, language)
      ?.then((t) => setTemplates(t ?? []))
      .catch(() => setTemplates([]));
  }, [token, kidId, language]);

  /** A copy of the template to check and change (pictures included) before saving. */
  function pickTemplate(t: ScheduleTemplate) {
    setDraft({ title: t.title, kind: t.kind, language: t.language, steps: t.steps.map((s) => ({ ...s, key: crypto.randomUUID() })), days: t.days, time: t.time, remind: true });
  }

  async function makeDraft(body: { text?: string; audio?: { mimeType: string; base64: string } }) {
    setError("");
    setBusy(true);
    try {
      const d = await api.draftVisualSchedule(token, kidId, { ...body, kind: null, language });
      setDraft({ title: d.title, kind: d.kind, language: d.language, steps: d.steps, days: d.days, time: d.time, remind: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status !== 503 ? err.message : "Pravnya couldn't make this right now. Try again, or start with a blank one.");
    } finally {
      setBusy(false);
    }
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
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) await makeDraft({ audio: { mimeType: blob.type, base64: await readAsBase64(blob) } });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Couldn't use the microphone. Check the permission, or type it instead.");
    }
  }

  if (draft) {
    return (
      <ScheduleEditor
        token={token}
        kidId={kidId}
        title="Check your schedule"
        initial={draft}
        saveLabel="Save schedule"
        onCancel={() => setDraft(null)}
        onSave={async (f) => {
          await api.createVisualSchedule(token, kidId, f);
          onSaved();
        }}
      />
    );
  }

  return (
    <Screen title="Make a picture schedule" onBack={onCancel}>
      <div className="flex flex-col gap-4">
        <p className="text-[0.95rem] text-[var(--pv-ink-soft)]">
          Tell Pravnya what {kidName} needs a schedule for, and when. For example: <em>"Getting ready for school every weekday at 7:30: wake up, toilet, brush teeth, uniform, breakfast, school bag."</em>
        </p>
        <textarea className={`${input} min-h-[120px]`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type it here..." aria-label="Describe the schedule" maxLength={1000} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--pv-ink-soft)]">Read aloud in</span>
          {(["en", "hi"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={language === l}
              onClick={() => setLanguage(l)}
              className={`rounded-full border px-3 py-1 text-sm ${language === l ? "border-[var(--pv-green-700)] bg-[var(--pv-green-700)] text-white" : "border-[var(--pv-border)] text-[var(--pv-ink-soft)]"}`}
            >
              {l === "en" ? "English" : "हिंदी"}
            </button>
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="button" disabled={busy || recording || text.trim().length < 3} onClick={() => makeDraft({ text })} className="rounded-2xl bg-[var(--pv-green-700)] px-4 py-3 text-[1rem] font-semibold text-white disabled:opacity-50">
          {busy ? "Pravnya is making it..." : "Make it"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={toggleRecording}
          className={`rounded-2xl border px-4 py-3 text-[1rem] font-semibold ${recording ? "border-red-600 bg-red-50 text-red-700" : "border-[var(--pv-green-700)] text-[var(--pv-green-700)]"}`}
        >
          {recording ? "■ Stop and make it" : "🎤 Say it instead"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setDraft({ title: text.trim().slice(0, 80) || "My schedule", kind: "ROUTINE", language, steps: [newStep(), newStep()], days: [], time: null, remind: true })}
          className="text-sm font-semibold text-[var(--pv-ink-soft)]"
        >
          Or start with a blank one
        </button>
        {templates.length ? (
          <section className="mt-2 flex flex-col gap-2">
            <span className={label}>Or start from a ready-made one</span>
            <p className="text-xs text-[var(--pv-ink-faint)]">You can change any step and swap any picture for a photo before saving.</p>
            {templates.map((t) => (
              <button key={t.id} type="button" disabled={busy} onClick={() => pickTemplate(t)} className="flex items-center gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-3 text-left">
                <div className="flex flex-shrink-0 gap-1">
                  {t.steps.slice(0, 3).map((s) =>
                    s.picture ? <img key={s.key} src={assetUrl(s.picture.url)} alt="" className="h-9 w-9 rounded bg-white object-contain" /> : <span key={s.key} className="h-9 w-9 rounded bg-[var(--pv-green-100)]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[0.95rem] font-semibold text-[var(--pv-ink)]">{t.title}</p>
                  <p className="text-xs text-[var(--pv-ink-faint)]">
                    {t.steps.length} steps · {t.scope === "CENTRE" ? "From your centre" : "From Pravnya"}
                  </p>
                </div>
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </Screen>
  );
}
