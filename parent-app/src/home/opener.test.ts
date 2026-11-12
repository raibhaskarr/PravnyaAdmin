import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ScheduleSlot } from "../api/client";
import { goalWithEvidence } from "../test/fixtures";
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

describe("computeOpener -- milestone path (takes priority over the schedule)", () => {
  const SEEN_KEY = "pravnya_seen_moment_kid-1";
  const MOMENT_DATE = "2026-11-10T09:00:00.000Z";
  const goals = () => [goalWithEvidence([{ outcome: "CORRECT", logDate: MOMENT_DATE }], { title: "Waves hello" })];
  const newestKey = `${MOMENT_DATE}|Waves hello|First independent success`;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  test("an unseen newest moment -> milestone opener, even when a session is also due", () => {
    expect(computeOpener("kid-1", goals(), [slot("s1", "Wed", "16:00")])).toEqual({
      kind: "milestone",
      moment: { date: MOMENT_DATE, goalTitle: "Waves hello", title: "First independent success", environment: "Home" }
    });
  });

  test("the newest moment already seen -> falls through to the schedule prompt", () => {
    localStorage.setItem(SEEN_KEY, newestKey);
    expect(computeOpener("kid-1", goals(), [slot("s1", "Wed", "16:00")])).toMatchObject({ kind: "schedule", slot: { id: "s1" } });
  });

  test("the newest moment already seen and no session due -> nothing", () => {
    localStorage.setItem(SEEN_KEY, newestKey);
    expect(computeOpener("kid-1", goals(), [])).toBeNull();
  });

  test("an older moment was seen but a newer one exists -> milestone for the newer one", () => {
    localStorage.setItem(SEEN_KEY, "2026-01-01T00:00:00.000Z|Waves hello|First independent success");
    expect(computeOpener("kid-1", goals(), [])).toMatchObject({ kind: "milestone", moment: { date: MOMENT_DATE } });
  });

  test("seen state is per kid", () => {
    localStorage.setItem("pravnya_seen_moment_kid-2", newestKey);
    expect(computeOpener("kid-1", goals(), [])).toMatchObject({ kind: "milestone" });
    expect(computeOpener("kid-2", goals(), [])).toBeNull();
  });

  test("storage unavailable -> treated as never seen", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(computeOpener("kid-1", goals(), [])).toMatchObject({ kind: "milestone" });
  });

  test("goals with evidence but no moment (no success, one setting) -> schedule path", () => {
    const noMoment = [goalWithEvidence([{ outcome: "PARTIAL", logDate: MOMENT_DATE }])];
    expect(computeOpener("kid-1", noMoment, [slot("s1", "Wed", "16:00")])).toMatchObject({ kind: "schedule" });
  });
});

describe("computeOpener -- schedule edge cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  test("exactly 45 minutes after start counts as due", () => {
    expect(computeOpener("kid-1", [], [slot("s1", "Wed", "16:15")])).toMatchObject({ kind: "schedule" });
  });

  test("a later-today session that hasn't started yet -> nothing", () => {
    expect(computeOpener("kid-1", [], [slot("s1", "Wed", "18:00")])).toBeNull();
  });

  test("malformed dismissed-slots storage is treated as nothing dismissed", () => {
    localStorage.setItem("pravnya_dismissed_slots_kid-1_" + NOW.toISOString().slice(0, 10), "{not json");
    expect(computeOpener("kid-1", [], [slot("s1", "Wed", "16:00")])).toMatchObject({ kind: "schedule" });
  });

  test("dismissing the latest session falls back to the next most recent one", () => {
    localStorage.setItem("pravnya_dismissed_slots_kid-1_" + NOW.toISOString().slice(0, 10), JSON.stringify(["late"]));
    expect(computeOpener("kid-1", [], [slot("early", "Wed", "09:00"), slot("late", "Wed", "15:00")])).toMatchObject({ slot: { id: "early" } });
  });

  test("a dismissal from a previous day doesn't carry over", () => {
    localStorage.setItem("pravnya_dismissed_slots_kid-1_2026-11-10", JSON.stringify(["s1"]));
    expect(computeOpener("kid-1", [], [slot("s1", "Wed", "16:00")])).toMatchObject({ kind: "schedule" });
  });
});
