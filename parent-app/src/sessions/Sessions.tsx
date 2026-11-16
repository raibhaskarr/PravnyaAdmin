import type { HomeSessionSummary, SessionSchedule } from "../api/client";

function when(s: SessionSchedule) {
  if (s.kind === "once") return "Once";
  return s.days.length === 7 ? "Every day" : `Every ${s.days.join(", ")}`;
}

function lastDone(s: HomeSessionSummary) {
  if (!s.lastRun) return "Not done yet";
  const d = new Date(s.lastRun.endedAt ?? s.lastRun.startedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `Last done ${d}${s.lastRun.status === "ENDED_EARLY" ? " (ended early)" : ""}`;
}

/** One session the therapist set: what it covers, when, and Start / Continue. */
export function SessionCard({ session, onStart }: { session: HomeSessionSummary; onStart: () => void }) {
  return (
    <div className={`rounded-2xl border bg-[var(--pv-surface)] p-4 ${session.dueToday ? "border-[var(--pv-green-700)]" : "border-[var(--pv-border)]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[1rem] font-semibold text-[var(--pv-ink)]">{session.title}</p>
          <p className="text-xs text-[var(--pv-ink-faint)]">
            From {session.authorName}
            {session.centreName ? ` · ${session.centreName}` : ""} · {when(session.schedule)}
          </p>
        </div>
        {session.dueToday ? <span className="flex-shrink-0 rounded-full bg-[var(--pv-green-700)] px-2 py-0.5 text-[0.7rem] font-bold text-white">Today</span> : null}
      </div>
      <ul className="mt-2 list-disc pl-5 text-[0.9rem] text-[var(--pv-ink-soft)]">
        {session.activities.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--pv-ink-faint)]">{lastDone(session)}</span>
        <button type="button" onClick={onStart} className="rounded-2xl bg-[var(--pv-green-700)] px-4 py-2 text-[0.95rem] font-semibold text-white">
          {session.inProgressRunId ? "Continue" : "Start session"}
        </button>
      </div>
    </div>
  );
}

/** Home card when a session is due today (or one was left halfway). */
export function TodaysSessionCard({ session, kidName, onStart }: { session: HomeSessionSummary; kidName: string; onStart: () => void }) {
  return (
    <button type="button" onClick={onStart} className="w-full rounded-2xl border border-[var(--pv-green-700)] bg-[var(--pv-surface)] p-4 text-left">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">🎯</span>
        <span className="text-sm font-medium text-[var(--pv-ink-faint)]">Today's session for {kidName}</span>
      </div>
      <p className="text-[0.98rem] text-[var(--pv-ink)]">
        {session.title}: {session.activities.length} activit{session.activities.length === 1 ? "y" : "ies"}, about 10-15 minutes. Pravnya guides you through it.
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--pv-green-700)]">{session.inProgressRunId ? "Continue the session" : "Start the session"}</p>
    </button>
  );
}
