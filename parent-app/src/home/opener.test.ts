import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ScheduleSlot } from "../api/client";
import { computeOpener } from "./opener";

// Wednesday 2026-11-11, 17:00 local time.
const NOW = new Date(2026, 10, 11, 17, 0);

const slot = (id: string, dayOfWeek: string, startTime: string): ScheduleSlot => ({
  id,
  label: "Speech therapy",
  dayOfWeek,
  startTime,
  therapist: null
});

describe("computeOpener -- schedule-aware 'how did it go?' prompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  test("no goals and no schedule -> nothing", () => {
    expect(computeOpener("kid-1", [], [])).toBeNull();
  });

  test("a session today that started 45+ minutes ago -> prompt to log it", () => {
    const opener = computeOpener("kid-1", [], [slot("s1", "Wed", "16:00")]);
    expect(opener).toEqual({ kind: "schedule", slot: expect.objectContaining({ id: "s1" }) });
  });

  test("a session that started less than 45 minutes ago -> not yet", () => {
    expect(computeOpener("kid-1", [], [slot("s1", "Wed", "16:30")])).toBeNull();
  });

  test("a session on another day -> nothing", () => {
    expect(computeOpener("kid-1", [], [slot("s1", "Tue", "09:00")])).toBeNull();
  });

  test("several eligible sessions -> the most recent one", () => {
    const opener = computeOpener("kid-1", [], [slot("early", "Wed", "09:00"), slot("late", "Wed", "15:00")]);
    expect(opener).toMatchObject({ kind: "schedule", slot: { id: "late" } });
  });

  test("a session dismissed today is not prompted again", () => {
    localStorage.setItem("pravnya_dismissed_slots_kid-1_" + NOW.toISOString().slice(0, 10), JSON.stringify(["s1"]));
    expect(computeOpener("kid-1", [], [slot("s1", "Wed", "16:00")])).toBeNull();
  });
});
