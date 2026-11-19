import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { apply, applyReport, InvalidChoice, normalize, startState, summarize, view, type Report, type RunState, type TryMark } from "./homeSessions.engine";
import { isDueToday } from "./homeSessions.service";
import { guessType } from "./homeSessions.ai";
import type { Activity, Plan } from "./homeSessions.schemas";

const activity = (over: Partial<Activity> = {}): Activity => ({
  key: randomUUID(),
  goalId: randomUUID(),
  goalTitle: "Labels objects",
  type: "EXPRESSIVE_LABEL",
  items: [
    { goalItemId: randomUUID(), label: "Ball" },
    { goalItemId: randomUUID(), label: "Cup" }
  ],
  trialsPerItem: 3,
  setup: "Sit face to face with the ball and cup.",
  instruction: "Hold up the {item} and ask \"What's this?\"",
  correctLooksLike: "Says the word within 5 seconds.",
  prompts: [
    { supportLevel: "VERBAL_PROMPT", say: "Say the first sound of {item}." },
    { supportLevel: "PHYSICAL_PROMPT", say: "Guide their hand to the {item}." }
  ],
  errorCorrection: "Say \"{item}\" and let them copy.",
  reinforcement: "High five and a bubble.",
  modality: "VERBAL",
  missesBeforeMovingOn: 2,
  ...over
});

const plan = (activities: Activity[]): Plan => ({ intro: "Let's play!", activities, closing: "Well done!" });

function toReport(s: RunState, marks: Record<string, TryMark[]>, help: string | null = null): Report {
  const act = s.plan.activities[s.a];
  return { items: act.items.map((i) => ({ goalItemId: i.goalItemId, tries: marks[i.label] ?? [] })), help };
}

describe("session engine: explain -> do -> report", () => {
  test("intro -> explain with the whole activity laid out -> report form", () => {
    const a = activity();
    let s = startState(plan([a]), "en", "Aarav");
    assert.deepEqual(view(s).choices.map((c) => c.id), ["ready"]);
    s = apply(s, "ready").state;
    const ex = view(s);
    assert.equal(ex.phase, "explain");
    assert.equal(ex.activityLabel, "Activity 1 of 1");
    assert.equal(ex.guide?.say, "Hold up the Ball, Cup and ask \"What's this?\"");
    assert.equal(ex.guide?.plan, "Ball, Cup: 3 tries each");
    assert.match(ex.guide!.moveOn, /2 times in a row/);
    assert.deepEqual(ex.guide?.helps, ["Gave a spoken hint: Say the first sound of Ball, Cup.", "Gave hands-on help: Guide their hand to the Ball, Cup."]);
    assert.match(ex.lines.join(" "), /Activity 1 of 1: Labels objects\./);
    assert.deepEqual(ex.choices.map((c) => c.id), ["start", "skip"]);
    s = apply(s, "start").state;
    const rep = view(s);
    assert.equal(rep.phase, "report");
    assert.deepEqual(rep.report?.items.map((i) => i.label), ["Ball", "Cup"]);
    assert.equal(rep.report?.triesPerItem, 3);
    assert.deepEqual(rep.report?.helps.map((h) => h.id), ["VERBAL_PROMPT", "PHYSICAL_PROMPT"]);
    assert.deepEqual(rep.progress, { done: 0, total: 6 });
  });

  test("a report logs every marked try in item order, with the help given, and moves on", () => {
    const a1 = activity();
    const a2 = activity({ goalTitle: "Second" });
    let s = apply(apply(startState(plan([a1, a2]), "en", "Aarav"), "ready").state, "start").state;
    const r = applyReport(s, toReport(s, { Cup: ["notyet", "help"], Ball: ["own", "own", "none"] }, "VERBAL_PROMPT"), new Date("2026-11-19T10:00:00Z"));
    assert.deepEqual(r.records.map((x) => [x.itemLabel, x.outcome, x.supportLevel]), [
      ["Ball", "CORRECT", "INDEPENDENT"],
      ["Ball", "CORRECT", "INDEPENDENT"],
      ["Cup", "INCORRECT", "UNKNOWN"],
      ["Cup", "CORRECT", "VERBAL_PROMPT"]
    ]);
    assert.equal(r.records[0].goalItemId, a1.items[0].goalItemId);
    assert.ok(r.records[0].at < r.records[3].at, "kept in order");
    s = r.state;
    assert.equal(view(s).phase, "explain");
    assert.equal(view(s).activityTitle, "Second");
    assert.equal(view(s).lines[0], "Good work! Keep the rewards quick and happy.");
    assert.equal(view(s).feedback, "Good work! Keep the rewards quick and happy.");
    assert.deepEqual(view(s).progress, { done: 6, total: 12 });
  });

  test("help without saying which is logged as unknown help; feedback fits how it went", () => {
    let s = apply(apply(startState(plan([activity(), activity()]), "en", "Aarav"), "ready").state, "start").state;
    const helped = applyReport(s, toReport(s, { Ball: ["help", "help", "own"] }));
    assert.deepEqual(helped.records.map((x) => x.supportLevel), ["UNKNOWN", "UNKNOWN", "INDEPENDENT"]);
    assert.equal(helped.state.feedback, "Good. Next time, try a little less help.");
    assert.equal(applyReport(s, toReport(s, { Ball: ["own"], Cup: ["own"] })).state.feedback, "Wonderful, Aarav did every try on their own!");
    assert.match(applyReport(s, toReport(s, { Ball: ["notyet", "notyet", "own"] })).state.feedback!, /hard today/);
    const nothing = applyReport(s, toReport(s, {}));
    assert.equal(nothing.records.length, 0);
    assert.match(nothing.state.feedback!, /skipped this one/);
    s = nothing.state;
    assert.equal(view(s).phase, "explain");
  });

  test("reports are checked against the activity", () => {
    const s = apply(apply(startState(plan([activity()]), "en", "A"), "ready").state, "start").state;
    assert.throws(() => applyReport(s, { items: [{ goalItemId: randomUUID(), tries: ["own"] }], help: null }), /isn't part of this activity/);
    assert.throws(() => applyReport(s, toReport(s, { Ball: ["own", "own", "own", "own"] })), /At most 3 tries/);
    assert.throws(() => applyReport(s, toReport(s, { Ball: ["help"] }, "FULL_ASSISTANCE")), /help isn't part/);
    const exp = apply(startState(plan([activity()]), "en", "A"), "ready").state;
    assert.throws(() => applyReport(exp, toReport(exp, { Ball: ["own"] })), /nothing to report/);
  });

  test("skip moves to the next activity; the last report ends the session", () => {
    const a1 = activity({ goalTitle: "First" });
    const a2 = activity({ goalTitle: "Second", items: [{ goalItemId: randomUUID(), label: "Dog" }], trialsPerItem: 1 });
    let s = apply(apply(startState(plan([a1, a2]), "en", "Aarav"), "ready").state, "skip").state;
    assert.equal(view(s).activityTitle, "Second");
    assert.equal(view(s).lines[0], "Skipped. On to the next activity.");
    s = apply(s, "start").state;
    assert.equal(view(s).choices[0].id, "skip", "the report screen can skip too");
    s = applyReport(s, toReport(s, { Dog: ["own"] })).state;
    assert.equal(view(s).phase, "done");
    assert.deepEqual(view(s).choices, []);
    assert.ok(view(s).lines.includes("Well done!"));
  });

  test("a choice that isn't offered is refused", () => {
    assert.throws(() => apply(startState(plan([activity()]), "en", "A"), "start"), InvalidChoice);
  });

  test("a run saved mid-try by the old flow resumes at its activity's explain step", () => {
    const a1 = activity({ goalTitle: "First" });
    const a2 = activity({ goalTitle: "Second" });
    const old = { plan: plan([a1, a2]), language: "en", kidName: "A", phase: "trial", a: 1, i: 1, t: 2, misses: 1, feedback: null } as RunState;
    assert.equal(normalize(old).phase, "explain");
    assert.equal(view(old).activityTitle, "Second");
    assert.equal(view(apply(old, "start").state).phase, "report");
  });

  test("Hindi phrases, and a per-activity summary", () => {
    let s = apply(apply(startState(plan([activity()]), "hi", "आरव"), "ready").state, "start").state;
    assert.match(view(s).lines.join(" "), /कैसा रहा/);
    const r = applyReport(s, toReport(s, { Ball: ["own", "notyet"] }));
    s = r.state;
    assert.equal(summarize(s.plan, r.records, "en"), "How it went:\nLabels objects: 2 tries, 1 on their own, 0 with help, 1 not yet.");
    assert.equal(summarize(s.plan, [], "en"), "No tries were logged.");
  });
});

describe("when a session is due", () => {
  const mon = new Date("2026-11-16T06:00:00Z"); // Monday in India
  test("once: until it's been done", () => {
    assert.equal(isDueToday({ kind: "once" }, [], mon), true);
    assert.equal(isDueToday({ kind: "once" }, [{ status: "IN_PROGRESS", startedAt: mon }], mon), true);
    assert.equal(isDueToday({ kind: "once" }, [{ status: "ENDED_EARLY", startedAt: mon }], mon), false);
  });
  test("weekly: on the chosen days, until done that day, and not after 'until'", () => {
    const weekly = { kind: "weekly" as const, days: ["Mon" as const, "Thu" as const], until: null };
    assert.equal(isDueToday(weekly, [], mon), true);
    assert.equal(isDueToday({ ...weekly, days: ["Tue"] }, [], mon), false);
    assert.equal(isDueToday(weekly, [{ status: "COMPLETED", startedAt: mon }], mon), false);
    assert.equal(isDueToday(weekly, [{ status: "COMPLETED", startedAt: new Date("2026-11-13T06:00:00Z") }], mon), true);
    assert.equal(isDueToday({ ...weekly, until: "2026-11-15" }, [], mon), false);
  });
});

describe("activity type from the goal's names (when drafting without AI)", () => {
  test("common goals map to the right format", () => {
    assert.equal(guessType("Requests preferred items using a two-word phrase Expressive Language"), "REQUESTING");
    assert.equal(guessType("Labels animals on AAC device"), "AAC_LABEL");
    assert.equal(guessType("Identifies common objects from a field of 3 Receptive Language"), "RECEPTIVE_ID");
    assert.equal(guessType("Produces /s/ in initial position Articulation"), "ARTICULATION");
    assert.equal(guessType("Follows a three-step morning routine"), "FOLLOW_DIRECTIONS");
    assert.equal(guessType("Names familiar objects"), "EXPRESSIVE_LABEL");
    assert.equal(guessType("Greets familiar adults"), "DISCRETE_TRIAL");
  });
});
