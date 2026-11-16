import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pickPractice, scoreItem, type Candidate, type ItemHistory } from "./homeSessions.practice";

const now = new Date("2026-11-18T10:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const h = (d: number, o: Partial<ItemHistory> = {}): ItemHistory => ({ centre: true, at: daysAgo(d), correct: true, independent: false, ...o });

function goal(id: string, area: string, items: [string, ItemHistory[]][]): Candidate {
  return { goalId: id, title: `Goal ${id}`, skill: "skill", area, measurementType: null, items: items.map(([label, history], n) => ({ goalItemId: `${id}-${n}`, label, history })) };
}

describe("practice session picker", () => {
  test("an item worked on at the centre, not yet independent and not done at home scores above one done at home this week", () => {
    const fresh = scoreItem([h(2)], now);
    const doneAtHome = scoreItem([h(2), h(1, { centre: false }), h(1, { centre: false }), h(0, { centre: false })], now);
    assert.ok(fresh.score > doneAtHome.score);
  });

  test("five independent tries in a row is mastered and goes to the back", () => {
    const m = scoreItem([0, 1, 2, 3, 4].map((d) => h(d, { independent: true })), now);
    assert.equal(m.mastered, true);
    assert.ok(m.score < scoreItem([], now).score);
  });

  test("picks at most 3 goals, prefers different areas, leaves mastered items out, and keeps to about 30 tries", () => {
    const pick = pickPractice(
      [
        goal("a", "Communication", [["Ball", [h(3)]], ["Cup", [h(3)]], ["Dog", []], ["Car", []]]),
        goal("b", "Communication", [["Water", [h(2)]]]),
        goal("c", "Social", [["Wave", [h(5)]], ["Clap", [0, 1, 2, 3, 4].map((d) => h(d, { independent: true }))]]),
        goal("d", "Self-care", [["Wash hands", [h(4)]]]),
        goal("e", "Play", [["", [h(1)]]])
      ],
      [],
      now
    )!;
    assert.equal(pick.goals.length, 3);
    assert.deepEqual(new Set(pick.goals.map((g) => g.area)).size, 3, "three different areas");
    const c = pick.goals.find((g) => g.id === "c");
    assert.deepEqual(c?.items.map((i) => i.label), ["Wave"], "mastered Clap is left out");
    assert.ok(pick.goals.find((g) => g.id === "a")!.items.length <= 3);
    assert.ok(pick.totalTries <= 28 && pick.totalTries >= 10, `tries ${pick.totalTries}`);
    assert.ok(pick.minutes >= 8 && pick.minutes <= 15, `minutes ${pick.minutes}`);
    assert.ok(pick.goals.every((g) => g.trialsPerItem >= 2 && g.trialsPerItem <= 4));
  });

  test("goals from the last practice session move back in line", () => {
    const goals = [goal("a", "A", [["x", [h(1)]]]), goal("b", "B", [["y", [h(1)]]]), goal("c", "C", [["z", [h(1)]]]), goal("d", "D", [["w", [h(1)]]])];
    const first = pickPractice(goals, [], now)!.goals.map((g) => g.id);
    const second = pickPractice(goals, first, now)!.goals.map((g) => g.id);
    assert.ok(second.some((id) => !first.includes(id)), "a goal left out last time comes in");
  });

  test("the easiest activity goes first; nothing to practise gives null", () => {
    const pick = pickPractice(
      [goal("hard", "A", [["x", [h(1, { correct: false })]]]), goal("easy", "B", [["y", [h(1, { independent: true }), h(2, { independent: true }), h(3)]]])],
      [],
      now
    )!;
    assert.equal(pick.goals[0].id, "easy");
    assert.equal(pickPractice([goal("none", "A", [])], [], now), null);
  });
});
