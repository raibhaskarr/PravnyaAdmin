// When a picture schedule is done: the time the therapist or parent set, or else one learned from
// when the family actually opens it. Pure functions, all in India time (where the families are).

export type Use = { startedAt: Date; completedAt: Date | null };
export type Timing = { time: string | null; days: string[]; source: "set" | "learned" | null };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const LEARN_FROM_DAYS = 28;
/** Distinct days of use before a usual time is trusted. */
export const MIN_DAYS_TO_LEARN = 3;
/** Shown on Home as "now" from this long before the time... */
export const NOW_BEFORE_MIN = 30;
/** ...until this long after it. */
export const NOW_AFTER_MIN = 90;
/** The reminder goes out this many minutes before the time. */
export const REMIND_BEFORE_MIN = 10;

export function inIndia(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return { weekday: parts.weekday, date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

export const toMinute = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHMM = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** The usual time (median start, to 5 minutes) and days (used on 2+ of that weekday) from recent use. */
export function learnPattern(uses: Use[], now = new Date()): { time: string | null; days: string[] } {
  const recent = uses.filter((u) => now.getTime() - u.startedAt.getTime() < LEARN_FROM_DAYS * 86_400_000);
  // One start per day: the first.
  const firstPerDay = new Map<string, { weekday: string; minute: number }>();
  for (const u of [...recent].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    const t = inIndia(u.startedAt);
    if (!firstPerDay.has(t.date)) firstPerDay.set(t.date, { weekday: t.weekday, minute: t.minute });
  }
  const days = [...firstPerDay.values()];
  if (days.length < MIN_DAYS_TO_LEARN) return { time: null, days: [] };
  const minutes = days.map((d) => d.minute).sort((a, b) => a - b);
  const mid = Math.floor(minutes.length / 2);
  const median = minutes.length % 2 ? minutes[mid] : Math.round((minutes[mid - 1] + minutes[mid]) / 2);
  const counts = new Map<string, number>();
  for (const d of days) counts.set(d.weekday, (counts.get(d.weekday) ?? 0) + 1);
  const usualDays = DAYS.filter((d) => (counts.get(d) ?? 0) >= 2);
  // Used most days of the week -> treat as every day.
  return { time: toHHMM(Math.round(median / 5) * 5), days: usualDays.length >= 5 ? [] : usualDays };
}

export function effectiveTiming(schedule: { time: string | null; days: string[] }, uses: Use[], now = new Date()): Timing {
  if (schedule.time) return { time: schedule.time, days: schedule.days, source: "set" };
  const learned = learnPattern(uses, now);
  if (!learned.time) return { time: null, days: schedule.days, source: null };
  return { time: learned.time, days: schedule.days.length ? schedule.days : learned.days, source: "learned" };
}

/** Where a schedule stands today, for Home. */
export function todayStatus(timing: Timing, uses: Use[], now = new Date()) {
  const t = inIndia(now);
  const forToday = timing.days.length === 0 || timing.days.includes(t.weekday);
  const todays = uses.filter((u) => inIndia(u.startedAt).date === t.date);
  const doneToday = todays.some((u) => u.completedAt);
  const minutesUntil = forToday && timing.time ? toMinute(timing.time) - t.minute : null;
  const dueNow = minutesUntil !== null && minutesUntil <= NOW_BEFORE_MIN && minutesUntil >= -NOW_AFTER_MIN && !doneToday;
  return { forToday, doneToday, startedToday: todays.length > 0, dueNow, minutesUntil };
}

/** Whether the reminder for today should go out now (the job runs every few minutes). */
export function reminderDue(timing: Timing, uses: Use[], now = new Date()) {
  const s = todayStatus(timing, uses, now);
  if (!s.forToday || s.minutesUntil === null || s.startedToday) return false;
  return s.minutesUntil <= REMIND_BEFORE_MIN && s.minutesUntil > -15;
}
