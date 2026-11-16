import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { apply, InvalidChoice, startState, summarize, view, type RunState, type TrialRecord } from "./homeSessions.engine";
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

function run(s: RunState, choices: string[]) {
  const records: TrialRecord[] = [];
  for (const c of choices) {
    const r = apply(s, c);
    s = r.state;
    if (r.record) records.push(r.record);
  }
  return { s, records };
}

describe("session engine", () => {
  test("intro -> setup -> tries per item in order, with the item filled in", () => {
    const a = activity();
    let s = startState(plan([a]), "en", "Aarav");
    assert.deepEqual(view(s).choices.map((c) => c.id), ["ready"]);
    s = apply(s, "ready").state;
    assert.equal(view(s).phase, "setup");
    assert.match(view(s).lines.join(" "), /Activity 1 of 1: Labels objects/);
    s = apply(s, "ready").state;
    const v = view(s);
    assert.equal(v.phase, "trial");
    assert.equal(v.item, "Ball");
    assert.ok(v.lines.includes("Hold up the Ball and ask \"What's this?\""));
    assert.deepEqual(v.progress, { done: 0, total: 6 });
    assert.equal(v.choices[0].label, "Aarav did it on their own");
  });

  test("on their own / with help are logged with the right help; feedback carries to the next step", () => {
    const a = activity();
    const { s, records } = run(startState(plan([a]), "en", "Aarav"), ["ready", "ready", "own", "help", "help:VERBAL_PROMPT"]);
    assert.deepEqual(records.map((r) => [r.itemLabel, r.outcome, r.supportLevel]), [
      ["Ball", "CORRECT", "INDEPENDENT"],
      ["Ball", "CORRECT", "VERBAL_PROMPT"]
    ]);
    assert.equal(records[0].goalItemId, a.items[0].goalItemId);
    assert.equal(view(s).item, "Ball");
    assert.match(view(s).lines[0], /next time try a little less help/);
    assert.deepEqual(view(s).progress, { done: 2, total: 6 });
  });

  test("the help step only offers the activity's own help levels, plus back", () => {
    const { s } = run(startState(plan([activity()]), "en", "Aarav"), ["ready", "ready", "help"]);
    assert.deepEqual(view(s).choices.map((c) => c.id), ["help:VERBAL_PROMPT", "help:PHYSICAL_PROMPT", "back"]);
    assert.equal(view(apply(s, "back").state).phase, "trial");
  });

  test("after N misses in a row it moves on to the next item, with the correction first", () => {
    const a = activity();
    const { s, records } = run(startState(plan([a]), "en", "Aarav"), ["ready", "ready", "notyet", "notyet"]);
    assert.deepEqual(records.map((r) => r.outcome), ["INCORRECT", "INCORRECT"]);
    const v = view(s);
    assert.equal(v.item, "Cup", "the third Ball try is skipped");
    assert.match(v.lines[0], /^Say "Ball" and let them copy\. That one's hard right now/);
  });

  test("skip moves to the next activity; finishing the last one ends the session", () => {
    const a1 = activity({ goalTitle: "First" });
    const a2 = activity({ goalTitle: "Second", items: [{ goalItemId: randomUUID(), label: "Dog" }], trialsPerItem: 1 });
    let { s } = run(startState(plan([a1, a2]), "en", "Aarav"), ["ready", "ready", "skip"]);
    assert.equal(view(s).phase, "setup");
    assert.equal(view(s).activityTitle, "Second");
    s = run(s, ["ready", "own"]).s;
    assert.equal(view(s).phase, "done");
    assert.deepEqual(view(s).choices, []);
    assert.ok(view(s).lines.includes("Well done!"));
  });

  test("a choice that isn't offered is refused", () => {
    assert.throws(() => apply(startState(plan([activity()]), "en", "A"), "own"), InvalidChoice);
  });

  test("Hindi phrases, and a per-activity summary", () => {
    const a = activity();
    const { s, records } = run(startState(plan([a]), "hi", "आरव"), ["ready", "ready", "own", "notyet"]);
    assert.match(view(s).lines.join(" "), /कोशिश/);
    assert.equal(summarize(s.plan, records, "en"), "How it went:\nLabels objects: 2 tries, 1 on their own, 0 with help, 1 not yet.");
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
