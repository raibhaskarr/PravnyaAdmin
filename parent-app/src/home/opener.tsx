import { useEffect, useState } from "react";
import { type Goal, type ScheduleSlot } from "../api/client";
import { type GrowthMoment, buildGrowthMoments } from "../growth/Growth";

// The one place Home lets Pravnya "speak first" -- everything else on Home (the feed, the nudge)
// is a static digest card; this is the only thing phrased and placed like it opened the
// conversation (rendered after the real thread, right above the composer). Deliberately NOT an AI
// model call -- same deterministic, data-driven spirit as the onboarding nudge, just conversational
// in tone. Client-side only: "already shown" lives in localStorage per kid, same accepted
// session/device-local tradeoff the nudge's dismiss state already has, not synced across devices.

export type Opener = { kind: "milestone"; moment: GrowthMoment } | { kind: "schedule"; slot: ScheduleSlot };

// GrowthMoment has no real id -- date+goalTitle+title together are already how buildGrowthMoments
// de-dupes conceptually distinct moments, so they're stable enough to use as one here.
function momentKey(moment: GrowthMoment): string {
  return `${moment.date}|${moment.goalTitle}|${moment.title}`;
}

function seenMomentKey(kidId: string): string {
  return `pravnya_seen_moment_${kidId}`;
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dismissedSlotsKey(kidId: string): string {
  return `pravnya_dismissed_slots_${kidId}_${todayDateStr()}`;
}

// Indexed by Date#getDay() (0=Sun..6=Sat) -- matches SCHEDULE_DAYS's exact spelling, not
// toLocaleDateString's weekday (which drifts by locale/environment).
const DAY_BY_INDEX = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A session is assumed "over enough to log" 45 minutes after its scheduled start -- there's no
// duration field on a slot, so this is a flat proxy rather than nothing at all.
const LOG_PROMPT_BUFFER_MINUTES = 45;

function minutesSinceMidnight(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function computeOpener(kidId: string, goals: Goal[], schedule: ScheduleSlot[]): Opener | null {
  const [newestMoment] = buildGrowthMoments(goals, 1);
  if (newestMoment) {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(seenMomentKey(kidId));
    } catch {
      // Storage unavailable -- treat as never-seen, same graceful degrade as session.ts.
    }
    if (momentKey(newestMoment) !== seen) return { kind: "milestone", moment: newestMoment };
  }

  const now = new Date();
  const today = DAY_BY_INDEX[now.getDay()];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let dismissedToday: string[] = [];
  try {
    dismissedToday = JSON.parse(localStorage.getItem(dismissedSlotsKey(kidId)) ?? "[]");
  } catch {
    // Malformed/unavailable storage -- treat as nothing dismissed yet.
  }

  const eligible = schedule
    .filter((s) => s.dayOfWeek === today && nowMinutes >= minutesSinceMidnight(s.startTime) + LOG_PROMPT_BUFFER_MINUTES)
    .filter((s) => !dismissedToday.includes(s.id))
    .sort((a, b) => b.startTime.localeCompare(a.startTime));

  if (eligible[0]) return { kind: "schedule", slot: eligible[0] };

  return null;
}

function markMomentSeen(kidId: string, moment: GrowthMoment) {
  try {
    localStorage.setItem(seenMomentKey(kidId), momentKey(moment));
  } catch {
    // Not fatal -- worst case the same milestone shows again next load.
  }
}

function markSlotDismissedToday(kidId: string, slotId: string) {
  try {
    const key = dismissedSlotsKey(kidId);
    const existing: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!existing.includes(slotId)) localStorage.setItem(key, JSON.stringify([...existing, slotId]));
  } catch {
    // Not fatal -- worst case the same prompt shows again later today.
  }
}

export function OpenerCard({
  opener,
  kidId,
  kidName,
  onSeeGrowth,
  onLogIt
}: {
  opener: Opener;
  kidId: string;
  kidName: string;
  onSeeGrowth: () => void;
  onLogIt: (seedText: string) => void;
}) {
  const [hidden, setHidden] = useState(false);

  // Marked seen on mount regardless of which action the parent takes (or none) -- it never
  // reappears next load just because they closed the tab without tapping anything.
  useEffect(() => {
    if (opener.kind === "milestone") markMomentSeen(kidId, opener.moment);
    else markSlotDismissedToday(kidId, opener.slot.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opener.kind === "milestone" ? momentKey(opener.moment) : opener.slot.id]);

  if (hidden) return null;

  const text =
    opener.kind === "milestone"
      ? `${kidName} ${opener.moment.title.charAt(0).toLowerCase()}${opener.moment.title.slice(1)} — nice work!`
      : `Looks like ${kidName} had ${opener.slot.label} today — want to jot down how it went?`;

  return (
    <div className="rounded-2xl bg-[var(--pv-surface)] px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">🤖</span>
          <span className="text-sm font-medium text-[var(--pv-ink-faint)]">Pravnya</span>
        </div>
        <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="px-1 text-[1rem] text-[var(--pv-ink-faint)] transition hover:text-[var(--pv-ink)]">
          ×
        </button>
      </div>
      <p className="mb-2 text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">{text}</p>
      {opener.kind === "milestone" ? (
        <button type="button" onClick={onSeeGrowth} className="text-[0.85rem] font-semibold text-[var(--pv-green-700)] hover:underline">
          See Growth
        </button>
      ) : (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onLogIt(`${opener.slot.label} today`)}
            className="text-[0.85rem] font-semibold text-[var(--pv-green-700)] hover:underline"
          >
            Log it
          </button>
          <button type="button" onClick={() => setHidden(true)} className="text-[0.85rem] font-medium text-[var(--pv-ink-faint)] hover:text-[var(--pv-ink)]">
            Not today
          </button>
        </div>
      )}
    </div>
  );
}
