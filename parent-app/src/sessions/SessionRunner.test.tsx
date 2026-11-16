import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type SessionStep } from "../api/client";
import { SessionRunner } from "./SessionRunner";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const step = (over: Partial<SessionStep> = {}): SessionStep => ({
  phase: "intro",
  activityTitle: null,
  item: null,
  lines: ["Let's play a naming game!", "Tap \"We're ready\" when you're both sitting together."],
  choices: [{ id: "ready", label: "We're ready" }],
  progress: { done: 0, total: 4 },
  ...over
});

const trial = step({
  phase: "trial",
  activityTitle: "Name familiar objects",
  item: "Ball",
  lines: ["Ball: try 1 of 2", "Hold up the Ball and ask \"What's this?\""],
  choices: [
    { id: "own", label: "Sam did it on their own" },
    { id: "help", label: "With help" },
    { id: "notyet", label: "Not yet" }
  ]
});

function renderRunner() {
  const onClose = vi.fn();
  render(<SessionRunner token="tok" kidId="kid-1" kidName="Sam" sessionId="s-1" onClose={onClose} />);
  return { onClose };
}

beforeEach(() => {
  mockApi.startSession.mockResolvedValue({ runId: "run-1", title: "Naming game", step: step(), resumed: false });
});

describe("<SessionRunner />", () => {
  test("starts the session and shows Pravnya's first step with its choices", async () => {
    renderRunner();
    expect(await screen.findByText(/Let's play a naming game!/)).toBeInTheDocument();
    expect(mockApi.startSession).toHaveBeenCalledWith("tok", "kid-1", "s-1");
    expect(screen.getByText("Naming game")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "We're ready" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answer by voice" })).toBeInTheDocument();
  });

  test("tapping a choice sends it, echoes it, and shows the next step with the item large", async () => {
    mockApi.sessionTurn.mockResolvedValue({ status: "IN_PROGRESS", step: trial, reply: null, logged: null, summary: null });
    renderRunner();
    await userEvent.click(await screen.findByRole("button", { name: "We're ready" }));
    expect(mockApi.sessionTurn).toHaveBeenCalledWith("tok", "kid-1", "run-1", { choice: "ready" });
    expect(await screen.findByText(/Hold up the Ball/)).toBeInTheDocument();
    expect(screen.getByText("Now practising")).toBeInTheDocument();
    expect(screen.getAllByText("We're ready").length).toBeGreaterThan(0);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  test("a typed question gets Pravnya's answer without moving on", async () => {
    mockApi.sessionTurn.mockResolvedValue({ status: "IN_PROGRESS", step: step(), reply: "It's fine to take a short break.", logged: null, summary: null });
    renderRunner();
    await screen.findByText(/Let's play a naming game!/);
    await userEvent.type(screen.getByLabelText("Tell Pravnya what happened"), "he's tired, what do I do?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(mockApi.sessionTurn).toHaveBeenCalledWith("tok", "kid-1", "run-1", { text: "he's tired, what do I do?" });
    expect(await screen.findByText("It's fine to take a short break.")).toBeInTheDocument();
    expect(screen.getByText("he's tired, what do I do?")).toBeInTheDocument();
  });

  test("the last try shows the summary and a Done button", async () => {
    mockApi.startSession.mockResolvedValue({ runId: "run-1", title: "Naming game", step: trial, resumed: true });
    mockApi.sessionTurn.mockResolvedValue({
      status: "COMPLETED",
      step: step({ phase: "done", lines: ["Great job today!"], choices: [], progress: { done: 4, total: 4 } }),
      reply: null,
      logged: { outcome: "CORRECT", supportLevel: "INDEPENDENT", itemLabel: "Ball" },
      summary: "How it went:\nName familiar objects: 4 tries, 3 on their own, 1 with help, 0 not yet."
    });
    const { onClose } = renderRunner();
    await userEvent.click(await screen.findByRole("button", { name: "Sam did it on their own" }));
    expect(await screen.findByText(/4 tries, 3 on their own/)).toBeInTheDocument();
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
