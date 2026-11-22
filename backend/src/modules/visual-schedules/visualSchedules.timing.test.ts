import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { effectiveTiming, learnPattern, reminderDue, todayStatus, type Use } from "./visualSchedules.timing";

// India is UTC+5:30: 02:00Z = 07:30 IST.
const at = (iso: string, completed = false): Use => ({ startedAt: new Date(iso), completedAt: completed ? new Date(iso) : null });
const NOW = new Date("2026-11-23T01:50:00Z"); // Mon 07:20 IST

describe("schedule timing", () => {
  test("learns the usual time from the first start of each day (median, to 5 minutes), after 3 days", () => {
    assert.deepEqual(learnPattern([at("2026-11-20T02:00:00Z"), at("2026-11-21T02:10:00Z")], NOW), { time: null, days: [] });
    const uses = [at("2026-11-17T01:55:00Z"), at("2026-11-17T09:00:00Z"), at("2026-11-18T02:05:00Z"), at("2026-11-19T02:12:00Z")];
    // Tue 07:25, Wed 07:35, Thu 07:42 -> median 07:35. (The later Tue start doesn't count.) Each weekday once -> no day pattern.
    assert.deepEqual(learnPattern(uses, NOW), { time: "07:35", days: [] });
  });

  test("days used twice or more become the schedule's days; uses older than 4 weeks are ignored", () => {
    const sat = ["2026-11-07", "2026-11-14", "2026-11-21"].map((d) => at(`${d}T04:30:00Z`)); // Saturdays 10:00 IST
    const old = at("2026-09-01T04:30:00Z");
    assert.deepEqual(learnPattern([...sat, old], NOW), { time: "10:00", days: ["Sat"] });
  });

  test("a set time wins over a learned one", () => {
    const uses = ["2026-11-18", "2026-11-19", "2026-11-20"].map((d) => at(`${d}T14:00:00Z`));
    assert.deepEqual(effectiveTiming({ time: "07:30", days: [] }, uses, NOW), { time: "07:30", days: [], source: "set" });
    assert.equal(effectiveTiming({ time: null, days: [] }, uses, NOW).source, "learned");
    assert.deepEqual(effectiveTiming({ time: null, days: ["Mon"] }, [], NOW), { time: null, days: ["Mon"], source: null });
  });

  test("Home: 'now' from 30 minutes before to 90 after, unless done today; not on other days", () => {
    const timing = { time: "07:30", days: [], source: "set" as const };
    assert.equal(todayStatus(timing, [], NOW).dueNow, true);
    assert.equal(todayStatus(timing, [], new Date("2026-11-23T01:30:00Z")).dueNow, true); // 07:00, exactly 30 min early
    assert.equal(todayStatus(timing, [], new Date("2026-11-23T01:29:00Z")).dueNow, false);
    assert.equal(todayStatus(timing, [], new Date("2026-11-23T03:30:00Z")).dueNow, true); // 09:00, 90 after
    assert.equal(todayStatus(timing, [at("2026-11-23T01:45:00Z", true)], NOW).dueNow, false);
    assert.equal(todayStatus({ ...timing, days: ["Tue"] }, [], NOW).forToday, false);
  });

  test("reminder: from 10 minutes before, once not started today", () => {
    const timing = { time: "07:30", days: [], source: "set" as const };
    assert.equal(reminderDue(timing, [], NOW), true); // 07:20
    assert.equal(reminderDue(timing, [], new Date("2026-11-23T01:45:00Z")), false); // 07:15
    assert.equal(reminderDue(timing, [at("2026-11-23T01:40:00Z")], NOW), false);
    assert.equal(reminderDue({ ...timing, time: null }, [], NOW), false);
  });
});
