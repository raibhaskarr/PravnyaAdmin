import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type EvidenceCandidate } from "../api/client";
import { deferred } from "../test/apiMock";
import { CENTRE_A, makeEvidenceCandidate } from "../test/fixtures";
import { LogSession } from "./LogSession";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

// --- browser APIs jsdom doesn't implement -------------------------------------------------------
let urlCounter = 0;
const createObjectURL = vi.fn(() => `blob:test/${++urlCounter}`);
const revokeObjectURL = vi.fn();

const trackStop = vi.fn();
const getUserMedia = vi.fn();
let supportedTypes: string[] = ["audio/webm"];

class FakeMediaRecorder {
  static isTypeSupported = (t: string) => supportedTypes.includes(t);
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "";
  }
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob([]) }); // empty chunk is ignored
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T10:00:00.000Z"));
  urlCounter = 0;
  supportedTypes = ["audio/webm"];
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
  mockApi.extractEvidence.mockResolvedValue({ candidates: [cand1, cand2] });
  mockApi.logEvidence.mockResolvedValue({} as never);
  mockApi.listCentres.mockResolvedValue([CENTRE_A]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const cand1 = makeEvidenceCandidate({ goalId: "goal-1", goalTitle: "Requests help", itemHint: "Says help", outcome: "PARTIAL", modality: "MANUAL_SIGN", confidence: 0.912 });
const cand2 = makeEvidenceCandidate({ goalId: "goal-2", goalTitle: "Waits for turn", measurementType: "DURATION", measurementValue: 90 });

function renderLog(initialText?: string) {
  const onBack = vi.fn();
  const utils = render(<LogSession token="tok" kidId="kid-1" kidName="Sam" initialText={initialText} onBack={onBack} />);
  return { ...utils, onBack, user: userEvent.setup() };
}

const review = () => screen.getByRole("button", { name: /^(Review with AI|Reviewing\.\.\.)$/ });

async function reviewText(user: ReturnType<typeof userEvent.setup>, text = "Sam signed help at lunch") {
  await user.type(screen.getByRole("textbox"), text);
  await user.click(review());
  await screen.findByText(/Found \d+ piece/);
}

describe("<LogSession /> -- write mode", () => {
  test("starts in Write mode, seeded with initialText when coming from Home's composer", () => {
    renderLog("ABA today");
    expect(screen.getByRole("textbox")).toHaveValue("ABA today");
    expect(screen.getByPlaceholderText("Describe what happened -- the AI will match it to Sam's goals.")).toBeInTheDocument();
    expect(review()).toBeEnabled();
  });

  test("Review is disabled for empty/whitespace text", async () => {
    const { user } = renderLog();
    expect(review()).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "   ");
    expect(review()).toBeDisabled();
  });

  test("Review sends trimmed text and lists the matched candidates, all approved", async () => {
    const { user } = renderLog();
    await user.type(screen.getByRole("textbox"), "  Sam signed help at lunch  ");
    await user.click(review());
    expect(mockApi.extractEvidence).toHaveBeenCalledWith("tok", "kid-1", { freeText: "Sam signed help at lunch" });
    expect(await screen.findByText("Found 2 pieces of evidence -- review and uncheck anything that's wrong before adding.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Requests help/ })).toHaveTextContent("Says help — Needed a little help · Signed (91% confident)");
    expect(screen.getByRole("button", { name: /Waits for turn/ })).toHaveTextContent("1 min 30 sec · Verbal");
    expect(screen.getByRole("button", { name: "Add 2 approved" })).toBeEnabled();
  });

  test("Reviewing... while the AI runs", async () => {
    mockApi.extractEvidence.mockReturnValue(new Promise(() => {}));
    const { user } = renderLog("x");
    await user.click(review());
    expect(review()).toHaveTextContent("Reviewing...");
    expect(review()).toBeDisabled();
  });

  test("AI error result, API error and generic error are each shown, staying on the input", async () => {
    mockApi.extractEvidence
      .mockResolvedValueOnce({ error: "Couldn't understand that." })
      .mockRejectedValueOnce(new ApiError(429, "Slow down"))
      .mockRejectedValueOnce(new Error("x"));
    const { user } = renderLog("something");
    await user.click(review());
    expect(await screen.findByText("Couldn't understand that.")).toBeInTheDocument();
    await user.click(review());
    expect(await screen.findByText("Slow down")).toBeInTheDocument();
    await user.click(review());
    expect(await screen.findByText("Couldn't review this right now.")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("something");
  });

  test("nothing matched -> explains and offers nothing to add", async () => {
    mockApi.extractEvidence.mockResolvedValue({ candidates: [] });
    const { user } = renderLog("unrelated");
    await user.click(review());
    expect(await screen.findByText("Nothing matched Sam's current goals -- try again, or log it manually from Goals.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 0 approved" })).toBeDisabled();
  });

  test("Back", async () => {
    const { user, onBack } = renderLog();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe("<LogSession /> -- review + save", () => {
  test("toggling a candidate off excludes it; Add saves approved ones with the chosen centre and shows a confirmation", async () => {
    const { user } = renderLog();
    await reviewText(user);
    await user.click(screen.getByRole("button", { name: /Requests help/ }));
    await user.click(screen.getByRole("button", { name: /Waits for turn/ }));
    expect(screen.getByRole("button", { name: "Add 0 approved" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Requests help/ }));
    expect(screen.getByRole("button", { name: "Add 1 approved" })).toBeInTheDocument();
    await user.click(screen.getByPlaceholderText(/leave blank for Home/));
    await user.click(await screen.findByRole("button", { name: CENTRE_A.name }));
    await user.click(screen.getByRole("button", { name: "Add 1 approved" }));

    expect(await screen.findByText("Added 1 entry. Ready whenever you are for the next one.")).toBeInTheDocument();
    expect(mockApi.logEvidence).toHaveBeenCalledTimes(1);
    expect(mockApi.logEvidence).toHaveBeenCalledWith("tok", "kid-1", "goal-1", {
      newItemCustomText: "Says help",
      logDate: "2026-11-12T10:00:00.000Z",
      centreId: CENTRE_A.id,
      outcome: "PARTIAL",
      supportLevel: "INDEPENDENT",
      modality: "MANUAL_SIGN",
      measurementValue: null,
      measurementUnit: null,
      measurementBoolean: null,
      measurementText: null
    });
    // Back to a fresh, empty input.
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  test("no centre -> centreId null; plural confirmation", async () => {
    const { user } = renderLog();
    await reviewText(user);
    await user.click(screen.getByRole("button", { name: "Add 2 approved" }));
    expect(await screen.findByText("Added 2 entries. Ready whenever you are for the next one.")).toBeInTheDocument();
    expect(mockApi.logEvidence.mock.calls.map((c) => c[3].centreId)).toEqual([null, null]);
    expect(mockApi.logEvidence.mock.calls[1][3]).toMatchObject({ newItemCustomText: undefined, measurementValue: 90 });
  });

  test("the confirmation clears when you start the next review", async () => {
    const { user } = renderLog();
    await reviewText(user);
    await user.click(screen.getByRole("button", { name: "Add 2 approved" }));
    await screen.findByText(/Added 2 entries/);
    await reviewText(user, "again");
    expect(screen.queryByText(/Added 2 entries/)).not.toBeInTheDocument();
  });

  test("Saving... while in flight; a failure keeps the review and explains (API vs generic)", async () => {
    const pending = deferred<never>();
    mockApi.logEvidence.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error("x"));
    const { user } = renderLog();
    await reviewText(user);
    await user.click(screen.getByRole("button", { name: "Add 2 approved" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    pending.reject(new ApiError(404, "Goal not found"));
    expect(await screen.findByText("Goal not found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add 2 approved" }));
    expect(await screen.findByText("Couldn't save some entries -- whatever got added before the failure is still saved.")).toBeInTheDocument();
    expect(screen.getByText(/Found 2 pieces/)).toBeInTheDocument();
  });

  test("Start over discards the review and the text", async () => {
    const { user } = renderLog();
    await reviewText(user);
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(mockApi.logEvidence).not.toHaveBeenCalled();
  });

  test("candidate labels for every measurement type", async () => {
    const c = (o: Partial<EvidenceCandidate>) => makeEvidenceCandidate(o);
    mockApi.extractEvidence.mockResolvedValue({
      candidates: [
        c({ measurementType: "FREQUENCY", measurementValue: 4, measurementUnit: null }),
        c({ measurementType: "FREQUENCY", measurementValue: 2, measurementUnit: "words" }),
        c({ measurementType: "DURATION", measurementValue: 30 }),
        c({ measurementType: "DURATION", measurementValue: 180 }),
        c({ measurementType: "PERCENTAGE", measurementValue: 49.6 }),
        c({ measurementType: "RATING", measurementValue: 3 }),
        c({ measurementType: "YES_NO", measurementBoolean: true }),
        c({ measurementType: "YES_NO", measurementBoolean: false }),
        c({ measurementType: "YES_NO", measurementBoolean: null, outcome: "NOT_OBSERVED", modality: "AAC" }),
        c({ measurementType: "FREE_OBSERVATION", measurementText: "Calm at drop-off", modality: "WRITTEN" }),
        c({ measurementType: "FREE_OBSERVATION", measurementText: null, outcome: "ODD", modality: "UNKNOWN_MODALITY" }),
        c({ measurementType: "RATING", measurementValue: null, outcome: "UNKNOWN", modality: "NOT_APPLICABLE" })
      ]
    });
    const { user } = renderLog("x");
    await user.click(review());
    await screen.findByText(/Found 12 pieces/);
    const text = document.body.textContent!;
    for (const s of ["4 times", "2 words", "30 sec", "3 min ·", "50%", "Rated 3/5", "Yes ·", "Not yet ·", "Didn't get a chance · AAC", "Calm at drop-off · Written", "ODD (", "Logged · N/A"]) {
      expect(text, s).toContain(s);
    }
  });
});

describe("<LogSession /> -- photo mode", () => {
  const photo = () => new File(["img"], "note.png", { type: "image/png" });
  const photoInput = () => document.querySelector<HTMLInputElement>("input[type='file']")!;

  test("pick a photo -> preview; Review sends it as base64 image", async () => {
    const { user } = renderLog();
    await user.click(screen.getByRole("button", { name: "Photo" }));
    expect(screen.getByText(/Snap a photo of a handwritten or printed note/)).toBeInTheDocument();
    expect(review()).toBeDisabled();
    await user.upload(photoInput(), photo());
    expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute("src", "blob:test/1");
    await user.click(review());
    await screen.findByText(/Found 2 pieces/);
    expect(mockApi.extractEvidence).toHaveBeenCalledWith("tok", "kid-1", { media: { kind: "image", mimeType: "image/png", base64: "aW1n" } });
  });

  test("a type-less photo falls back to image/jpeg; replacing a photo revokes the old preview URL", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<LogSession token="tok" kidId="kid-1" kidName="Sam" onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Photo" }));
    await user.upload(photoInput(), photo());
    await user.upload(photoInput(), new File(["img"], "raw", { type: "" }));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
    await user.click(review());
    await screen.findByText(/Found 2 pieces/);
    expect(mockApi.extractEvidence).toHaveBeenCalledWith("tok", "kid-1", { media: { kind: "image", mimeType: "image/jpeg", base64: "aW1n" } });
  });

  test("switching modes clears an error and returns Write's text intact", async () => {
    mockApi.extractEvidence.mockResolvedValue({ error: "Nope" });
    const { user } = renderLog("draft text");
    await user.click(review());
    expect(await screen.findByText("Nope")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Photo" }));
    expect(screen.queryByText("Nope")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Write" }));
    expect(screen.getByRole("textbox")).toHaveValue("draft text");
  });

  // BUG: the unmount cleanup effect has [] deps, so it closes over the INITIAL (null)
  // photoPreviewUrl/audioUrl and never revokes the URLs created later -- a blob URL leak every
  // time the parent leaves Log after picking a photo or recording.
  test.fails("BUG: leaving the screen revokes the current photo preview URL", async () => {
    const { user, unmount } = renderLog();
    await user.click(screen.getByRole("button", { name: "Photo" }));
    await user.upload(photoInput(), photo());
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
  });
});

describe("<LogSession /> -- voice mode", () => {
  async function record(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Voice" }));
    await user.click(screen.getByRole("button", { name: "Start recording" }));
    expect(await screen.findByText("Recording... describe what happened, then stop.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop recording" }));
  }

  test("record -> playback -> Review sends base64 audio with the recorder's mime type", async () => {
    const { user, container } = renderLog();
    await record(user);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(trackStop).toHaveBeenCalled();
    expect(container.querySelector("audio")).toHaveAttribute("src", "blob:test/1");
    await user.click(review());
    await screen.findByText(/Found 2 pieces/);
    expect(mockApi.extractEvidence).toHaveBeenCalledWith("tok", "kid-1", { media: { kind: "audio", mimeType: "audio/webm", base64: "dm9pY2U=" } });
  });

  test("no supported mime type -> recorder default, blob/request fall back to audio/webm", async () => {
    supportedTypes = [];
    const { user } = renderLog();
    await record(user);
    await user.click(review());
    await screen.findByText(/Found 2 pieces/);
    expect(mockApi.extractEvidence).toHaveBeenCalledWith("tok", "kid-1", { media: { kind: "audio", mimeType: "audio/webm", base64: "dm9pY2U=" } });
  });

  test("Re-record discards the clip (revoking its URL) and Review is disabled again", async () => {
    const { user, container } = renderLog();
    await record(user);
    await user.click(screen.getByRole("button", { name: "Re-record" }));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
    expect(container.querySelector("audio")).toBeNull();
    expect(screen.getByRole("button", { name: "Start recording" })).toBeInTheDocument();
    expect(review()).toBeDisabled();
  });

  test("microphone permission denied -> explains how to fix it", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const { user } = renderLog();
    await user.click(screen.getByRole("button", { name: "Voice" }));
    await user.click(screen.getByRole("button", { name: "Start recording" }));
    expect(await screen.findByText("Couldn't access the microphone -- check your browser's microphone permission and try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start recording" })).toBeInTheDocument();
  });

  test("Start over after a voice review clears the recording", async () => {
    const { user, container } = renderLog();
    await record(user);
    await user.click(review());
    await user.click(await screen.findByRole("button", { name: "Start over" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start recording" })).toBeInTheDocument());
    expect(container.querySelector("audio")).toBeNull();
  });
});
