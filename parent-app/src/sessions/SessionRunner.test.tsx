import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type SessionStep, type SessionTurnResult } from "../api/client";
import { SessionRunner } from "./SessionRunner";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const step = (over: Partial<SessionStep> = {}): SessionStep => ({
  phase: "intro",
  activityTitle: null,
  activityLabel: null,
  feedback: null,
  item: null,
  lines: ["Let's play a naming game!", "For each activity I'll explain what to do."],
  guide: null,
  report: null,
  choices: [{ id: "ready", label: "We're ready" }],
  progress: { done: 0, total: 4 },
  ...over
});

const guide = {
  setup: "Keep the Ball, Cup out of sight.",
  say: "Hold up the Ball, Cup and ask \"What's this?\"",
  countsWhen: "Says the word within 5 seconds.",
  helps: ["Gave a spoken hint: Say the first sound.", "Gave hands-on help: Guide their hand."],
  ifMiss: "Say the word and let them copy.",
  reward: "A high five.",
  plan: "Ball, Cup: 2 tries each",
  moveOn: "If an item is missed 2 times in a row, move on to the next one."
};
const BALL = "11111111-1111-4111-8111-111111111111";
const CUP = "22222222-2222-4222-8222-222222222222";

const explain = step({
  phase: "explain",
  activityTitle: "Name familiar objects",
  activityLabel: "Activity 1 of 2",
  lines: ["Activity 1 of 2: Name familiar objects."],
  guide,
  choices: [
    { id: "start", label: "Got it, let's start" },
    { id: "skip", label: "Skip this activity" }
  ]
});
const reportStep = step({
  phase: "report",
  activityTitle: "Name familiar objects",
  activityLabel: "Activity 1 of 2",
  lines: ["How did \"Name familiar objects\" go?", "Mark each try, or just tell me."],
  guide,
  report: {
    items: [
      { goalItemId: BALL, label: "Ball" },
      { goalItemId: CUP, label: "Cup" }
    ],
    triesPerItem: 2,
    helps: [
      { id: "VERBAL_PROMPT", label: "Gave a spoken hint" },
      { id: "PHYSICAL_PROMPT", label: "Gave hands-on help" }
    ]
  },
  choices: [{ id: "skip", label: "Skip this activity" }]
});
const result = (s: SessionStep, over: Partial<SessionTurnResult> = {}): SessionTurnResult => ({ status: "IN_PROGRESS", step: s, reply: null, logged: [], summary: null, ...over });

function renderRunner() {
  const onClose = vi.fn();
  render(<SessionRunner token="tok" kidId="kid-1" kidName="Sam" sessionId="s-1" onClose={onClose} />);
  return { onClose };
}

beforeEach(() => {
  mockApi.startSession.mockResolvedValue({ runId: "run-1", title: "Naming game", step: step(), resumed: false });
});

describe("<SessionRunner />", () => {
  test("starts with Pravnya introducing the session", async () => {
    renderRunner();
    expect(await screen.findByText(/Let's play a naming game!/)).toBeInTheDocument();
    expect(mockApi.startSession).toHaveBeenCalledWith("tok", "kid-1", "s-1");
    expect(screen.getByText("Naming game")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "We're ready" })).toBeInTheDocument();
  });

  test("explain shows the whole activity; starting puts the phone down, then the report grid", async () => {
    mockApi.sessionTurn.mockResolvedValueOnce(result(explain)).mockResolvedValueOnce(result(reportStep));
    renderRunner();
    await userEvent.click(await screen.findByRole("button", { name: "We're ready" }));
    expect(mockApi.sessionTurn).toHaveBeenCalledWith("tok", "kid-1", "run-1", { choice: "ready" });
    expect(await screen.findByText("Keep the Ball, Cup out of sight.")).toBeInTheDocument();
    expect(screen.getByText("Gave hands-on help: Guide their hand.")).toBeInTheDocument();
    expect(screen.getByText(/With Sam · Activity 1 of 2/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Got it, let's start" }));
    expect(mockApi.sessionTurn).toHaveBeenLastCalledWith("tok", "kid-1", "run-1", { choice: "start" });
    expect(await screen.findByText(/Put the phone down/)).toBeInTheDocument();
    expect(screen.getByText("Ball · Cup")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /We're done/ }));
    expect(screen.getByRole("button", { name: "Ball, try 1: not done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "We didn't do this one" })).toBeInTheDocument();
  });

  test("tapping marks each try, asks which help, and sends the whole report", async () => {
    mockApi.startSession.mockResolvedValue({ runId: "run-1", title: "Naming game", step: reportStep, resumed: true });
    mockApi.sessionTurn.mockResolvedValue(result(step({ ...explain, activityLabel: "Activity 2 of 2", feedback: "Good work!" })));
    renderRunner();
    // Resumed on the report step: straight to the grid.
    const ball1 = await screen.findByRole("button", { name: "Ball, try 1: not done" });
    await userEvent.click(ball1); // -> on their own
    await userEvent.click(screen.getByRole("button", { name: "Cup, try 2: not done" }));
    await userEvent.click(screen.getByRole("button", { name: "Cup, try 2: on their own" })); // -> with help
    expect(screen.getByText("What help did you mostly give?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Gave hands-on help" }));
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(mockApi.sessionTurn).toHaveBeenCalledWith("tok", "kid-1", "run-1", {
      report: {
        items: [
          { goalItemId: BALL, tries: ["own", "none"] },
          { goalItemId: CUP, tries: ["none", "help"] }
        ],
        help: "PHYSICAL_PROMPT"
      }
    });
    expect(await screen.findByText("Good work!")).toBeInTheDocument();
    expect(screen.getByText(/Activity 2 of 2/)).toBeInTheDocument();
  });

  test("'All ✓' fills a row", async () => {
    mockApi.startSession.mockResolvedValue({ runId: "run-1", title: "Naming game", step: reportStep, resumed: true });
    renderRunner();
    await userEvent.click(await screen.findByRole("button", { name: "Ball: all on their own" }));
    expect(screen.getByRole("button", { name: "Ball, try 2: on their own" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and continue" })).toBeInTheDocument();
  });

  test("saying how it went fills in the grid to check; nothing is sent until Save", async () => {
    mockApi.startSession.mockResolvedValue({ runId: "run-1", title: "Naming game", step: reportStep, resumed: true });
    mockApi.sessionReportDraft.mockResolvedValue({ report: { items: [{ goalItemId: BALL, tries: ["own", "notyet"] }], help: null }, reply: "Ball: 1 of 2 on his own." });
    renderRunner();
    await userEvent.type(await screen.findByLabelText("Tell Pravnya how it went"), "ball 1 of 2");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(mockApi.sessionReportDraft).toHaveBeenCalledWith("tok", "kid-1", "run-1", { text: "ball 1 of 2" });
    expect(await screen.findByText("Ball: 1 of 2 on his own.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ball, try 1: on their own" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ball, try 2: not yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cup, try 1: not done" })).toBeInTheDocument();
    expect(mockApi.sessionTurn).not.toHaveBeenCalled();
  });

  test("a question on the explain step gets Pravnya's answer without moving on", async () => {
    mockApi.startSession.mockResolvedValue({ runId: "run-1", title: "Naming game", step: explain, resumed: true });
    mockApi.sessionTurn.mockResolvedValue(result(explain, { reply: "A favourite snack works well." }));
    renderRunner();
    await userEvent.type(await screen.findByLabelText("Ask Pravnya"), "what reward?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(mockApi.sessionTurn).toHaveBeenCalledWith("tok", "kid-1", "run-1", { text: "what reward?" });
    expect(await screen.findByText("A favourite snack works well.")).toBeInTheDocument();
    expect(screen.getByText("Keep the Ball, Cup out of sight.")).toBeInTheDocument();
  });

  test("the last report shows the summary and a Done button", async () => {
    mockApi.startSession.mockResolvedValue({ runId: "run-1", title: "Naming game", step: reportStep, resumed: true });
    mockApi.sessionTurn.mockResolvedValue(
      result(step({ phase: "done", lines: ["Great job today!"], choices: [], progress: { done: 4, total: 4 } }), {
        status: "COMPLETED",
        summary: "How it went:\nName familiar objects: 4 tries, 4 on their own, 0 with help, 0 not yet."
      })
    );
    const { onClose } = renderRunner();
    await userEvent.click(await screen.findByRole("button", { name: "Ball: all on their own" }));
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText(/4 tries, 4 on their own/)).toBeInTheDocument();
    expect(screen.getByText(/sent to the therapist/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("ending early asks first, then shows what was saved", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApi.endSession.mockResolvedValue({ status: "ENDED_EARLY", summary: "How it went:\nName familiar objects: 1 tries, 1 on their own, 0 with help, 0 not yet." });
    renderRunner();
    await screen.findByText(/Let's play a naming game!/);
    await userEvent.click(screen.getByRole("button", { name: "End" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByText(/1 tries, 1 on their own/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  test("errors are shown, and a failed start says so", async () => {
    mockApi.startSession.mockRejectedValue(new ApiError(404, "Session not found"));
    renderRunner();
    expect(await screen.findByText("Session not found")).toBeInTheDocument();
  });

  test("a turn that fails keeps the step and shows the message", async () => {
    mockApi.sessionTurn.mockRejectedValue(new ApiError(409, "This session has already ended"));
    renderRunner();
    await userEvent.click(await screen.findByRole("button", { name: "We're ready" }));
    await waitFor(() => expect(screen.getByText("This session has already ended")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "We're ready" })).toBeInTheDocument();
  });
});
