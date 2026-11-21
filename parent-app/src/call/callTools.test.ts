import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type SessionStep } from "../api/client";
import { describeTally, emptyTally, findItem, runTool, type ToolContext } from "./callTools";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const base: SessionStep = {
  phase: "intro",
  activityTitle: null,
  activityLabel: null,
  feedback: null,
  item: null,
  lines: ["Hi"],
  guide: null,
  report: null,
  choices: [{ id: "ready", label: "We're ready" }],
  progress: { done: 0, total: 4 }
};
const playing: SessionStep = {
  ...base,
  phase: "report",
  activityTitle: "Name objects",
  activityLabel: "Activity 1 of 2",
  report: {
    items: [
      { goalItemId: "b", label: "Ball" },
      { goalItemId: "c", label: "Red cup" }
    ],
    triesPerItem: 2,
    helps: [{ id: "VERBAL_PROMPT", label: "Gave a spoken hint" }]
  },
  choices: [{ id: "skip", label: "Skip" }]
};
const explain: SessionStep = { ...base, phase: "explain", activityTitle: "Name objects", activityLabel: "Activity 1 of 2", guide: null, choices: [] };

const ctx = (step: SessionStep, over: Partial<ToolContext> = {}): ToolContext => ({ token: "tok", kidId: "k", runId: "r", step, tally: emptyTally(step), ...over });

beforeEach(() => vi.resetAllMocks());

describe("call tools", () => {
  test("items are found by name, loosely", () => {
    expect(findItem(playing, "ball")).toBe(0);
    expect(findItem(playing, "the red cup")).toBe(1);
    expect(findItem(playing, "cup")).toBe(1);
    expect(findItem(playing, "dog")).toBe(-1);
  });

  test("record_try fills the next try of that item; undo takes it back; a full item is refused", async () => {
    let c = ctx(playing);
    let out = await runTool("record_try", { item: "Ball", result: "own" }, c);
    expect(out.response).toMatchObject({ ok: true, recorded: "Ball try 1: on their own" });
    c = { ...c, tally: out.tally! };
    out = await runTool("record_try", { item: "ball", result: "help", help: "VERBAL_PROMPT" }, c);
    c = { ...c, tally: out.tally! };
    expect(c.tally!.report).toEqual({ help: "VERBAL_PROMPT", items: [{ goalItemId: "b", tries: ["own", "help"] }, { goalItemId: "c", tries: ["none", "none"] }] });
    expect(describeTally(playing, c.tally!)).toBe("Ball: on their own, with help | Red cup: nothing yet (2 left)");
    expect((await runTool("record_try", { item: "Ball", result: "notyet" }, c)).response.error).toMatch(/All 2 tries for Ball/);
    expect((await runTool("record_try", { item: "dog", result: "own" }, c)).response.error).toMatch(/isn't in this activity.*Ball, Red cup/);
    out = await runTool("undo_last_try", {}, c);
    expect(out.tally!.report.items[0].tries).toEqual(["own", "none"]);
    expect(mockApi.sessionTurn).not.toHaveBeenCalled();
  });

  test("save_activity sends the tally as the report and moves on; nothing marked is refused", async () => {
    expect((await runTool("save_activity", {}, ctx(playing))).response.error).toMatch(/No tries are recorded/);
    const c = ctx(playing);
    const recorded = await runTool("record_try", { item: "Ball", result: "notyet" }, c);
    mockApi.sessionTurn.mockResolvedValue({ status: "IN_PROGRESS", step: { ...explain, activityLabel: "Activity 2 of 2", feedback: "Good work!" }, reply: null, logged: [], summary: null });
    const out = await runTool("save_activity", {}, { ...c, tally: recorded.tally! });
    expect(mockApi.sessionTurn).toHaveBeenCalledWith("tok", "k", "r", { report: { help: null, items: [{ goalItemId: "b", tries: ["notyet", "none"] }, { goalItemId: "c", tries: ["none", "none"] }] } });
    expect(out.response).toMatchObject({ ok: true, next: "explain", activity: "Activity 2 of 2", feedbackOnLastActivity: "Good work!" });
    expect(out.step?.phase).toBe("explain");
    expect(out.tally).toBeNull();
  });

  test("the last save finishes the session; end_session ends it early", async () => {
    const c = ctx(playing);
    const recorded = await runTool("record_try", { item: "Ball", result: "own" }, c);
    mockApi.sessionTurn.mockResolvedValue({ status: "COMPLETED", step: { ...base, phase: "done", lines: ["Well done!"], choices: [] }, reply: null, logged: [], summary: "How it went: ..." });
    const out = await runTool("save_activity", {}, { ...c, tally: recorded.tally! });
    expect(out.finished).toBe(true);
    expect(out.response).toMatchObject({ sessionDone: true, summary: "How it went: ...", closing: "Well done!" });

    mockApi.endSession.mockResolvedValue({ status: "ENDED_EARLY", summary: "Part done" });
    const ended = await runTool("end_session", {}, ctx(explain));
    expect(ended).toMatchObject({ finished: true, summary: "Part done", response: { sessionEnded: true } });
  });

  test("steps follow the session: ready from the intro, start from explain; wrong-time calls are told where it is", async () => {
    mockApi.sessionTurn.mockResolvedValue({ status: "IN_PROGRESS", step: explain, reply: null, logged: [], summary: null });
    expect((await runTool("ready_for_activity", {}, ctx(base))).response).toMatchObject({ ok: true, next: "explain" });
    expect(mockApi.sessionTurn).toHaveBeenLastCalledWith("tok", "k", "r", { choice: "ready" });
    expect((await runTool("start_playing", {}, ctx(base))).response.error).toMatch(/at: intro/);
    expect((await runTool("record_try", { item: "Ball", result: "own" }, ctx(explain))).response.error).toMatch(/after start_playing/);
    expect((await runTool("start_playing", {}, ctx(playing))).response).toMatchObject({ alreadyPlaying: true, items: ["Ball", "Red cup"] });
    mockApi.sessionTurn.mockRejectedValue(new ApiError(409, "This session has already ended"));
    expect((await runTool("skip_activity", {}, ctx(explain))).response.error).toBe("This session has already ended");
  });
});
