import type { VisualSchedule } from "../../api/types";

// A Mon-Sun grid at the top of a child's Visual schedules tab. Each published schedule with a time
// shows as a block in every column it runs on. "No set time" ones get their own row underneath so
// they're never lost. Tapping a block scrolls to that schedule's card and opens it for editing.

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = (typeof DAYS)[number];
const DAY_LONG: Record<Day, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

// Hours shown. Earlier / later schedules clamp to the nearest edge.
const START_HOUR = 6;
const END_HOUR = 22;
const ROW_PX = 24;

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function WeeklyTimetable({ schedules, onOpen }: { schedules: VisualSchedule[]; onOpen: (id: string) => void }) {
  const active = schedules.filter((s) => s.status === "ACTIVE");
  if (!active.length) return null;
  const today = (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const)[new Date().getDay()];

  const timed = active.filter((s) => s.timing.time);
  const untimed = active.filter((s) => !s.timing.time);

  // Every published schedule with a time, mapped to its days (empty days = every day).
  const blocks: { schedule: VisualSchedule; day: Day; top: number; height: number }[] = [];
  for (const s of timed) {
    const mins = toMinutes(s.timing.time!);
    const top = Math.max(0, mins - START_HOUR * 60);
    const days: Day[] = (s.timing.days.length ? (s.timing.days as Day[]) : DAYS) as Day[];
    for (const day of days) blocks.push({ schedule: s, day, top: (top / 60) * ROW_PX, height: ROW_PX * 1.5 });
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const colClass = "border-l border-[var(--pv-border)]";

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>This week</strong>
        <span className="hint-text">Tap a block to change the schedule. Learned times are shown in a lighter shade.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "48px repeat(7, 1fr)", overflowX: "auto" }}>
        <div />
        {DAYS.map((d) => (
          <div key={d} style={{ padding: "0.25rem 0.5rem", textAlign: "center", fontWeight: 600, background: d === today ? "var(--pv-green-100, #e8f6ef)" : undefined }} title={DAY_LONG[d]}>
            {d}
          </div>
        ))}
        {/* Hours column + day columns */}
        <div style={{ gridColumn: "1 / 2", display: "flex", flexDirection: "column", color: "var(--pv-ink-faint, #8b998f)", fontSize: "0.75rem" }}>
          {hours.map((h) => (
            <div key={h} style={{ height: ROW_PX, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 4 }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {DAYS.map((d, dIdx) => (
          <div key={d} className={colClass} style={{ position: "relative", height: hours.length * ROW_PX, background: d === today ? "var(--pv-green-100, #e8f6ef)" : undefined }}>
            {/* Hour lines */}
            {hours.map((_, i) => (
              <div key={i} style={{ position: "absolute", top: i * ROW_PX, left: 0, right: 0, borderTop: i === 0 ? "none" : "1px dashed var(--pv-border, #e3ebe4)" }} />
            ))}
            {blocks
              .filter((b) => b.day === d)
              .map((b, i) => (
                <button
                  key={`${b.schedule.id}-${d}-${i}`}
                  type="button"
                  onClick={() => onOpen(b.schedule.id)}
                  title={`${b.schedule.title} · ${b.schedule.timing.time}${b.schedule.timing.source === "learned" ? " (learned)" : ""}`}
                  style={{
                    position: "absolute",
                    top: b.top, left: 2, right: 2,
                    height: b.height,
                    padding: "0.15rem 0.35rem",
                    borderRadius: 6,
                    border: "1px solid var(--pv-green-700, #136b4d)",
                    background: b.schedule.timing.source === "learned" ? "var(--pv-green-100, #e8f6ef)" : "var(--pv-green-700, #136b4d)",
                    color: b.schedule.timing.source === "learned" ? "var(--pv-ink, #1c2b22)" : "white",
                    fontSize: "0.72rem", lineHeight: 1.2, textAlign: "left", overflow: "hidden",
                    cursor: "pointer"
                  }}
                >
                  <strong style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.schedule.title}</strong>
                  <span>{b.schedule.timing.time}{b.schedule.remind ? " · 🔔" : ""}</span>
                </button>
              ))}
            {dIdx === 0 ? null : null}
          </div>
        ))}
      </div>
      {untimed.length ? (
        <div>
          <div className="hint-text">No set time:</div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
            {untimed.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpen(s.id)}
                className="p-button p-button-text p-button-sm"
                title="Open this schedule to set a day and time"
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
