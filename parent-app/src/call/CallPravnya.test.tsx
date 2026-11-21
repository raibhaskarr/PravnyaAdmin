import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type SessionStep } from "../api/client";
import { CallPravnya } from "./CallPravnya";
import type { LiveEvents } from "./liveClient";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const live = { sendAudio: vi.fn(), sendText: vi.fn(), sendToolResponses: vi.fn(), close: vi.fn() };
let events: LiveEvents;
vi.mock("./liveClient", () => ({
  connectLive: vi.fn(async (_opts: unknown, ev: LiveEvents) => {
    events = ev;
    return live;
  })
}));
vi.mock("./audio", () => ({
  startMic: vi.fn(async () => ({ setMuted: vi.fn(), stop: vi.fn() })),
  VoicePlayer: class {
    speaking = false;
    play = vi.fn();
    interrupt = vi.fn();
    level = () => 0;
  }
}));

class FakeAudioContext {
  close = vi.fn(async () => {});
}

const playing: SessionStep = {
  phase: "report",
  activityTitle: "Name objects",
  activityLabel: "Activity 1 of 1",
  feedback: null,
  item: null,
  lines: [],
  guide: null,
  report: { items: [{ goalItemId: "b", label: "Ball" }], triesPerItem: 2, helps: [] },
  choices: [],
  progress: { done: 0, total: 2 }
};

function renderCall() {
  const onExit = vi.fn();
  render(<CallPravnya token="tok" kidId="kid-1" kidName="Sam" runId="run-1" title="Naming game" onExit={onExit} />);
  return { onExit };
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
  mockApi.startCall.mockResolvedValue({ token: "auth_tokens/t", model: "gemini-3.8-live", apiVersion: "v1beta", expiresAt: "", step: playing });
});
afterEach(() => vi.unstubAllGlobals());

describe("<CallPravnya />", () => {
  test("explains the call first; starting connects with the session's token and asks Pravnya to begin", async () => {
    renderCall();
    expect(screen.getByText(/Your voice isn't recorded or saved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "📞 Start call" }));
    expect(mockApi.startCall).toHaveBeenCalledWith("tok", "kid-1", "run-1");
    const { connectLive } = await import("./liveClient");
    expect(connectLive).toHaveBeenCalledWith(expect.objectContaining({ token: "auth_tokens/t", model: "gemini-3.8-live", apiVersion: "v1beta" }), expect.anything());
    await waitFor(() => expect(live.sendText).toHaveBeenCalledWith(expect.stringMatching(/The parent has joined the call/)));
    expect(screen.getByRole("button", { name: "Hang up" })).toBeInTheDocument();
    expect(screen.getByText("Name objects")).toBeInTheDocument();
  });

  test("Pravnya's words show as subtitles; her tool calls update the tally and are answered", async () => {
    renderCall();
    await userEvent.click(screen.getByRole("button", { name: "📞 Start call" }));
    await waitFor(() => expect(live.sendText).toHaveBeenCalled());
    act(() => {
      events.onPravnyaText("Lovely, ");
      events.onPravnyaText("that's one!");
      events.onParentText("he got it");
    });
    expect(screen.getByText("Lovely, that's one!")).toBeInTheDocument();
    expect(screen.getByText("You: he got it")).toBeInTheDocument();
    act(() => events.onToolCall([{ id: "c1", name: "record_try", args: { item: "ball", result: "own" } }]));
    await waitFor(() => expect(live.sendToolResponses).toHaveBeenCalledWith([{ id: "c1", name: "record_try", response: expect.objectContaining({ ok: true, recorded: "Ball try 1: on their own" }) }]));
    expect(screen.getByLabelText("Ball, try 1: own")).toBeInTheDocument();
  });

  test("hanging up mid-activity hands the unsaved tries back to the screens", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onExit } = renderCall();
    await userEvent.click(screen.getByRole("button", { name: "📞 Start call" }));
    await waitFor(() => expect(live.sendText).toHaveBeenCalled());
    act(() => events.onToolCall([{ id: "c1", name: "record_try", args: { item: "Ball", result: "help" } }]));
    await waitFor(() => expect(live.sendToolResponses).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Hang up" }));
    expect(live.close).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledWith({ help: null, items: [{ goalItemId: "b", tries: ["help", "none"] }] });
  });

  test("a dropped call offers to reconnect", async () => {
    renderCall();
    await userEvent.click(screen.getByRole("button", { name: "📞 Start call" }));
    await waitFor(() => expect(live.sendText).toHaveBeenCalled());
    act(() => events.onClose("network"));
    expect(await screen.findByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing saved is lost/)).toBeInTheDocument();
  });

  test("when calls aren't available it says so and the screens still work", async () => {
    mockApi.startCall.mockRejectedValue(new ApiError(503, "Calls aren't available right now. Carry on with the step-by-step screens."));
    const { onExit } = renderCall();
    await userEvent.click(screen.getByRole("button", { name: "📞 Start call" }));
    expect(await screen.findByText(/Calls aren't available right now/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to the screens" }));
    expect(onExit).toHaveBeenCalledWith(null);
  });
});
