import { useEffect, useRef, useState } from "react";
import { api, assetUrl, type VisualSchedule, type VisualScheduleStep } from "../api/client";
import { useSpeaker } from "../sessions/PravnyaGuide";
import { enablePush, pushState, type PushState } from "./push";

// Picture schedules the therapist made: First/Then, routines and day plans. The parent opens one and
// hands the phone to the child (or holds it up): one big picture at a time, tap to hear it, "Done"
// to tick it off. Progress is kept on this device for today only.

export const SYMBOL_CREDIT = "Symbols: Mulberry Symbols by Steve Lee, CC BY-SA 4.0";

const KIND_LABEL: Record<VisualSchedule["kind"], string> = { FIRST_THEN: "First / Then", ROUTINE: "Routine", DAY: "Day plan" };

/** "7:30 am" from "07:30". */
export function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

function whenText(s: VisualSchedule) {
  if (!s.timing.time) return null;
  return s.timing.source === "learned" ? `Usually ${clock(s.timing.time)}` : clock(s.timing.time);
}

function todayKey(id: string) {
  return `pv-vs-${id}-${new Date().toLocaleDateString("en-CA")}`;
}

function loadDone(id: string): number {
  try {
    const n = Number(localStorage.getItem(todayKey(id)));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveDone(id: string, n: number) {
  try {
    localStorage.setItem(todayKey(id), String(n));
  } catch {
    // Private mode or storage blocked: progress just isn't remembered.
  }
}

function Picture({ step, className }: { step: VisualScheduleStep; className: string }) {
  return step.picture ? (
    <img src={assetUrl(step.picture.url)} alt="" className={`${className} object-contain`} draggable={false} />
  ) : (
    <div className={`${className} flex items-center justify-center rounded-2xl bg-[var(--pv-green-100)] text-4xl`}>⭐</div>
  );
}

/** A schedule in a list (Activities): title, a strip of its pictures, Open. */
export function ScheduleCard({ schedule, onOpen }: { schedule: VisualSchedule; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`w-full rounded-2xl border bg-[var(--pv-surface)] p-4 text-left ${schedule.forToday ? "border-[var(--pv-green-700)]" : "border-[var(--pv-border)]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[1rem] font-semibold text-[var(--pv-ink)]">{schedule.title}</p>
          <p className="text-xs text-[var(--pv-ink-faint)]">
            {KIND_LABEL[schedule.kind]} · {schedule.mine ? "Made by you" : `From ${schedule.authorName}${schedule.centreName ? ` · ${schedule.centreName}` : ""}`}
            {schedule.timing.days.length && schedule.timing.days.length < 7 ? ` · ${schedule.timing.days.join(", ")}` : ""}
            {whenText(schedule) ? ` · ${whenText(schedule)}` : ""}
          </p>
        </div>
        {schedule.doneToday ? (
          <span className="flex-shrink-0 rounded-full bg-[var(--pv-green-100)] px-2 py-0.5 text-[0.7rem] font-bold text-[var(--pv-green-700)]">Done today</span>
        ) : schedule.forToday && schedule.timing.days.length ? <span className="flex-shrink-0 rounded-full bg-[var(--pv-green-700)] px-2 py-0.5 text-[0.7rem] font-bold text-white">Today</span> : null}
      </div>
      <div className="mt-3 flex gap-2 overflow-hidden">
        {schedule.steps.slice(0, 6).map((s) => (
          <div key={s.key} className="flex w-14 flex-shrink-0 flex-col items-center gap-1">
            <Picture step={s} className="h-12 w-12 rounded-lg bg-white" />
            <span className="w-full truncate text-center text-[0.65rem] text-[var(--pv-ink-soft)]">{s.label}</span>
          </div>
        ))}
        {schedule.steps.length > 6 ? <span className="self-center text-xs text-[var(--pv-ink-faint)]">+{schedule.steps.length - 6}</span> : null}
      </div>
    </button>
  );
}

/** Offers schedule reminders (once the parent has a schedule with a time). */
export function RemindersPrompt({ token }: { token: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("pv-reminders-dismissed") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    void pushState().then(setState).catch(() => setState("unsupported"));
  }, []);
  if (dismissed || !state || state === "on" || state === "unsupported") return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("pv-reminders-dismissed", "1");
    } catch {
      // fine
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[var(--pv-green-100)] p-3 text-sm text-[var(--pv-ink)]">
      {state === "needs-home-screen" ? (
        <p>
          To get a reminder when it's time, add Pravnya to your Home Screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, and open it from there.
        </p>
      ) : state === "blocked" ? (
        <p>Notifications are blocked for Pravnya. Allow them in your browser's site settings to get reminders.</p>
      ) : (
        <p>Get a reminder on this phone when it's time for a schedule?</p>
      )}
      <div className="flex gap-3">
        {state === "off" ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState(await enablePush(token).catch(() => "off" as const));
              setBusy(false);
            }}
            className="rounded-lg bg-[var(--pv-green-700)] px-3 py-1.5 font-semibold text-white"
          >
            {busy ? "Turning on..." : "Turn on reminders"}
          </button>
        ) : null}
        <button type="button" onClick={dismiss} className="font-semibold text-[var(--pv-ink-soft)]">
          Not now
        </button>
      </div>
    </div>
  );
}

/**
 * Home card. A schedule whose time is now (set, or learned from when it's usually opened) comes
 * first and big; the rest of today's follow, in time order.
 */
export function TodaysSchedulesCard({ token, schedules, kidName, onOpen }: { token: string; schedules: VisualSchedule[]; kidName: string; onOpen: (id: string) => void }) {
  const now = schedules.filter((s) => s.dueNow).sort((a, b) => (a.minutesUntil ?? 0) - (b.minutesUntil ?? 0));
  const rest = schedules
    .filter((s) => s.forToday && !s.dueNow)
    .sort((a, b) => (a.minutesUntil ?? 9999) - (b.minutesUntil ?? 9999));
  if (!now.length && !rest.length) return null;
  const hasTime = schedules.some((s) => s.timing.time && s.remind);
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">🗓️</span>
        <span className="text-sm font-medium text-[var(--pv-ink-faint)]">{kidName}'s picture schedules</span>
      </div>
      {now.map((s) => (
        <button key={s.id} type="button" onClick={() => onOpen(s.id)} className="flex items-center gap-3 rounded-2xl border-2 border-[var(--pv-green-700)] bg-white p-3 text-left">
          {s.steps[0] ? <Picture step={s.steps[0]} className="h-16 w-16" /> : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--pv-green-700)]">{s.startedToday ? "Carry on" : "Time for"}</p>
            <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">{s.title}</p>
            <p className="text-xs text-[var(--pv-ink-faint)]">{whenText(s)}</p>
          </div>
          <span className="text-sm font-semibold text-[var(--pv-green-700)]">Open</span>
        </button>
      ))}
      {rest.length ? (
        <div className="flex flex-wrap gap-2">
          {rest.map((s) => (
            <button key={s.id} type="button" onClick={() => onOpen(s.id)} className={`flex items-center gap-2 rounded-xl border border-[var(--pv-border)] px-3 py-2 text-sm font-semibold text-[var(--pv-ink)] ${s.doneToday ? "opacity-60" : ""}`}>
              {s.steps[0] ? <Picture step={s.steps[0]} className="h-7 w-7 bg-white" /> : null}
              {s.title}
              {s.doneToday ? <span className="text-[var(--pv-green-700)]">✓</span> : whenText(s) ? <span className="font-normal text-[var(--pv-ink-faint)]">{whenText(s)}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {hasTime ? <RemindersPrompt token={token} /> : null}
    </div>
  );
}

function useCountdown() {
  const [left, setLeft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setLeft(null);
  };
  const start = (minutes: number) => {
    stop();
    setLeft(minutes * 60);
    timer.current = setInterval(() => setLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
  };
  useEffect(() => stop, []);
  return { left, start, stop };
}

function Timer({ minutes, countdown }: { minutes: number; countdown: ReturnType<typeof useCountdown> }) {
  const { left } = countdown;
  if (left === null) {
    return (
      <button type="button" onClick={() => countdown.start(minutes)} className="rounded-full border border-[var(--pv-border)] px-4 py-1.5 text-sm font-semibold text-[var(--pv-ink-soft)]">
        ⏱ Start {minutes}-minute timer
      </button>
    );
  }
  const pct = left / (minutes * 60);
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-1" role="timer" aria-label={`${Math.ceil(left / 60)} minutes left`}>
      <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--pv-border)]">
        <div className="h-full bg-[var(--pv-green-700)] transition-[width] duration-1000" style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="text-sm font-semibold text-[var(--pv-ink-soft)]">{left === 0 ? "Time's up!" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
    </div>
  );
}

/** Full screen, for the child. */
export function VisualScheduleView({
  schedule,
  onClose,
  token,
  kidId,
  onEdit
}: {
  schedule: VisualSchedule;
  onClose: () => void;
  /** With these, opening and finishing are recorded (that's how its usual time is learned). */
  token?: string;
  kidId?: string;
  onEdit?: () => void;
}) {
  const [done, setDone] = useState(() => Math.min(loadDone(schedule.id), schedule.steps.length));
  const speaker = useSpeaker(true);
  const countdown = useCountdown();
  const lang = schedule.language === "hi" ? "hi-IN" : "en-IN";
  const hi = schedule.language === "hi";
  const finished = done >= schedule.steps.length;
  const current = schedule.steps[done];
  const firstThen = schedule.kind === "FIRST_THEN";

  const say = (s: VisualScheduleStep, prefix?: string) => speaker.speak([`${prefix ? `${prefix} ` : ""}${s.say ?? s.label}`], lang);

  function track(event: "start" | "complete") {
    if (token && kidId) void api.recordScheduleUse(token, kidId, schedule.id, event)?.catch(() => {});
  }

  function setProgress(n: number) {
    countdown.stop();
    if (n >= schedule.steps.length && done < schedule.steps.length) track("complete");
    setDone(n);
    saveDone(schedule.id, n);
    const next = schedule.steps[n];
    if (next) say(next, firstThen ? (n === 0 ? (hi ? "पहले" : "First") : hi ? "फिर" : "Then") : undefined);
    else speaker.speak([hi ? "सब हो गया! शाबाश!" : "All done! Well done!"], lang);
  }

  // Read the current step when the schedule opens, and note that it was opened.
  useEffect(() => {
    track("start");
    if (current) say(current, firstThen ? (done === 0 ? (hi ? "पहले" : "First") : hi ? "फिर" : "Then") : undefined);
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[var(--pv-ink-soft)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <p className="min-w-0 flex-1 truncate text-[1.05rem] font-semibold text-[var(--pv-ink)]">{schedule.title}</p>
        {done > 0 ? (
          <button type="button" onClick={() => setProgress(0)} className="text-sm font-semibold text-[var(--pv-green-700)]">
            {hi ? "फिर से" : "Start again"}
          </button>
        ) : null}
        {onEdit ? (
          <button type="button" onClick={onEdit} className="text-sm font-semibold text-[var(--pv-ink-soft)]">
            {schedule.mine ? "Edit" : "Time"}
          </button>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {firstThen ? (
          <div className="grid flex-1 grid-cols-2 gap-3">
            {schedule.steps.map((s, i) => {
              const isDone = i < done;
              const isNow = i === done;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => say(s)}
                  className={`relative flex flex-col items-center justify-center gap-2 rounded-3xl border-4 bg-white p-3 ${isNow ? "border-[var(--pv-green-700)]" : "border-[var(--pv-border)]"} ${isDone ? "opacity-50" : ""}`}
                >
                  <span className="self-start text-lg font-bold text-[var(--pv-ink)]">{i === 0 ? (hi ? "पहले" : "First") : hi ? "फिर" : "Then"}</span>
                  <Picture step={s} className="aspect-square w-full max-w-[260px]" />
                  <span className="text-2xl font-bold text-[var(--pv-ink)]">{s.label}</span>
                  {isDone ? <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--pv-green-700)] text-xl text-white">✓</span> : null}
                </button>
              );
            })}
          </div>
        ) : finished ? null : (
          <button type="button" onClick={() => say(current)} className="flex flex-col items-center gap-2 rounded-3xl border-4 border-[var(--pv-green-700)] bg-white p-4" aria-label={`Now: ${current.label}. Tap to hear it.`}>
            <span className="self-start text-sm font-bold text-[var(--pv-ink-faint)]">
              {hi ? "अभी" : "Now"} · {done + 1}/{schedule.steps.length}
            </span>
            <Picture step={current} className="aspect-square w-full max-w-[300px]" />
            <span className="text-3xl font-bold text-[var(--pv-ink)]">{current.label}</span>
          </button>
        )}

        {finished ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl bg-[var(--pv-green-100)] p-6 text-center">
            <span className="text-5xl">🎉</span>
            <p className="text-2xl font-bold text-[var(--pv-ink)]">{hi ? "सब हो गया!" : "All done!"}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {current.minutes ? <Timer key={current.key} minutes={current.minutes} countdown={countdown} /> : null}
            <button type="button" onClick={() => setProgress(done + 1)} className="w-full max-w-sm rounded-2xl bg-[var(--pv-green-700)] px-6 py-4 text-xl font-bold text-white">
              ✓ {hi ? "हो गया" : "Done"}
            </button>
          </div>
        )}

        {!firstThen ? (
          <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="All steps">
            {schedule.steps.map((s, i) => (
              <li key={s.key} className="flex-shrink-0">
                <button
                  type="button"
                  onClick={() => say(s)}
                  className={`relative flex w-20 flex-col items-center gap-1 rounded-xl border-2 bg-white p-1.5 ${i === done ? "border-[var(--pv-green-700)]" : "border-[var(--pv-border)]"} ${i < done ? "opacity-45" : ""}`}
                >
                  <Picture step={s} className="h-14 w-14" />
                  <span className="w-full truncate text-center text-[0.7rem] text-[var(--pv-ink-soft)]">{s.label}</span>
                  {i < done ? <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--pv-green-700)] text-xs text-white">✓</span> : null}
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        <p className="mt-auto text-center text-[0.65rem] text-[var(--pv-ink-faint)]">{SYMBOL_CREDIT}</p>
      </main>
    </div>
  );
}
