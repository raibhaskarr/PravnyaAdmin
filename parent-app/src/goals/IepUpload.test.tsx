import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type EvidenceCandidate } from "../api/client";
import { deferred } from "../test/apiMock";
import { CENTRE_A, makeEvidenceCandidate, makeIepGoalCandidate } from "../test/fixtures";
import { IepUpload } from "./IepUpload";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const NOW = new Date("2026-11-12T10:00:00.000Z");
const pdf = () => new File(["hello"], "iep-2026.pdf", { type: "application/pdf" });
const fileInput = () => document.querySelector<HTMLInputElement>("input[type='file']")!;

function renderUpload() {
  const onBack = vi.fn();
  render(<IepUpload token="tok" kidId="kid-1" kidName="Sam" onBack={onBack} />);
  // applyAccept off so a file with an empty mime type can still be picked (the jpeg fallback case).
  return { onBack, user: userEvent.setup({ applyAccept: false }) };
}

async function extract(user: ReturnType<typeof userEvent.setup>, file: File = pdf()) {
  await user.upload(fileInput(), file);
  await user.click(screen.getByRole("button", { name: "Review with AI" }));
}

const update1 = makeEvidenceCandidate({ goalId: "goal-1", goalTitle: "Requests help", itemHint: "Says help", outcome: "PARTIAL", modality: "VERBAL", confidence: 0.876, excerpt: "Uses 'help' with prompts" });
const update2 = makeEvidenceCandidate({ goalId: "goal-2", goalTitle: "Follows directions", measurementType: "PERCENTAGE", measurementValue: 72.4, modality: "NOT_APPLICABLE" });
const newGoal1 = makeIepGoalCandidate({ title: "Uses 3-word phrases", confidence: 0.6 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockApi.extractIep.mockResolvedValue({ statusUpdates: [update1, update2], newGoals: [newGoal1] });
  mockApi.logEvidence.mockResolvedValue({} as never);
  mockApi.acceptIepGoals.mockResolvedValue({ created: 1, skipped: 0 });
  mockApi.listCentres.mockResolvedValue([CENTRE_A]);
});
afterEach(() => vi.useRealTimers());

describe("<IepUpload /> pick + extract", () => {
  test("Review is disabled until a file is picked; the file name shows", async () => {
    const { user } = renderUpload();
    expect(screen.getByText(/look for updates to Sam's existing goals/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review with AI" })).toBeDisabled();
    await user.upload(fileInput(), pdf());
    expect(screen.getByText("iep-2026.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review with AI" })).toBeEnabled();
  });

  test("the drop zone opens the file picker", async () => {
    const { user } = renderUpload();
    const spy = vi.spyOn(fileInput(), "click");
    await user.click(screen.getByRole("button", { name: /Tap to choose a file/ }));
    expect(spy).toHaveBeenCalled();
  });

  test("sends a PDF as raw base64; an image with its mime type (jpeg if unknown)", async () => {
    const { user } = renderUpload();
    await extract(user);
    await screen.findByText(/Found 3 things/);
    expect(mockApi.extractIep).toHaveBeenLastCalledWith("tok", "kid-1", { kind: "pdf", base64: "aGVsbG8=" });

    await user.click(screen.getByRole("button", { name: "Start over" }));
    await extract(user, new File(["img"], "scan", { type: "" }));
    await screen.findByText(/Found 3 things/);
    expect(mockApi.extractIep).toHaveBeenLastCalledWith("tok", "kid-1", { kind: "image", base64: "aW1n", mimeType: "image/jpeg" });
  });

  test("Reading document... while extracting", async () => {
    mockApi.extractIep.mockReturnValue(new Promise(() => {}));
    const { user } = renderUpload();
    await extract(user);
    expect(screen.getByRole("button", { name: "Reading document..." })).toBeDisabled();
  });

  test("AI error result, nothing found, API error and generic error all return to pick with a message", async () => {
    mockApi.extractIep
      .mockResolvedValueOnce({ error: "This file is not readable." })
      .mockResolvedValueOnce({ statusUpdates: [], newGoals: [] })
      .mockRejectedValueOnce(new ApiError(413, "File too large"))
      .mockRejectedValueOnce(new Error("x"));
    const { user } = renderUpload();
    await extract(user);
    expect(await screen.findByText("This file is not readable.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review with AI" }));
    expect(await screen.findByText("We couldn't find anything matching Sam's goals in this document.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review with AI" }));
    expect(await screen.findByText("File too large")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review with AI" }));
    expect(await screen.findByText("Couldn't read that document. Try again.")).toBeInTheDocument();
  });

  test("Back leaves the screen", async () => {
    const { user, onBack } = renderUpload();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe("<IepUpload /> review + save", () => {
  test("lists both kinds of candidate, all pre-approved, with readable labels", async () => {
    const { user } = renderUpload();
    await extract(user);
    expect(await screen.findByText("Found 3 things -- review and uncheck anything that's wrong before adding.")).toBeInTheDocument();
    expect(screen.getByText("Updates to existing goals")).toBeInTheDocument();
    expect(screen.getByText("New goals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Requests help/ })).toHaveTextContent("Says help — Needed a little help · Verbal (88% confident)");
    expect(screen.getByRole("button", { name: /Follows directions/ })).toHaveTextContent("72% · N/A (90% confident)");
    expect(screen.getByRole("button", { name: /Uses 3-word phrases/ })).toHaveTextContent("Communication › Requesting (60% confident)");
    expect(screen.getByRole("button", { name: "Add 3 approved" })).toBeEnabled();
    // Centre picker only for status updates.
    expect(screen.getByPlaceholderText("e.g. Bright Steps Clinic -- leave blank for Home")).toBeInTheDocument();
  });

  test("no centre picker or updates section when only new goals were found", async () => {
    mockApi.extractIep.mockResolvedValue({ statusUpdates: [], newGoals: [newGoal1] });
    const { user } = renderUpload();
    await extract(user);
    expect(await screen.findByText(/Found 1 thing --/)).toBeInTheDocument();
    expect(screen.queryByText("Updates to existing goals")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/leave blank for Home/)).not.toBeInTheDocument();
  });

  test("only new-goals section absent when only updates were found", async () => {
    mockApi.extractIep.mockResolvedValue({ statusUpdates: [update1], newGoals: [] });
    const { user } = renderUpload();
    await extract(user);
    await screen.findByText(/Found 1 thing --/);
    expect(screen.queryByText("New goals")).not.toBeInTheDocument();
  });

  test("toggling candidates changes the count; zero approved disables Add", async () => {
    const { user } = renderUpload();
    await extract(user);
    await user.click(await screen.findByRole("button", { name: /Requests help/ }));
    expect(screen.getByRole("button", { name: "Add 2 approved" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Follows directions/ }));
    await user.click(screen.getByRole("button", { name: /Uses 3-word phrases/ }));
    expect(screen.getByRole("button", { name: "Add 0 approved" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Uses 3-word phrases/ }));
    expect(screen.getByRole("button", { name: "Add 1 approved" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Requests help/ }));
    expect(screen.getByRole("button", { name: "Add 2 approved" })).toBeEnabled();
  });

  test("saving logs each approved update (tagged with the chosen centre) and accepts approved new goals, then goes back", async () => {
    const { user, onBack } = renderUpload();
    await extract(user);
    await user.click(await screen.findByRole("button", { name: /Follows directions/ })); // un-approve update2
    await user.click(screen.getByPlaceholderText(/leave blank for Home/));
    await user.click(await screen.findByRole("button", { name: CENTRE_A.name }));
    await user.click(screen.getByRole("button", { name: "Add 2 approved" }));

    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    expect(mockApi.logEvidence).toHaveBeenCalledTimes(1);
    expect(mockApi.logEvidence).toHaveBeenCalledWith("tok", "kid-1", "goal-1", {
      newItemCustomText: "Says help",
      logDate: NOW.toISOString(),
      centreId: CENTRE_A.id,
      outcome: "PARTIAL",
      supportLevel: "INDEPENDENT",
      modality: "VERBAL",
      measurementValue: null,
      measurementUnit: null,
      measurementBoolean: null,
      measurementText: null
    });
    expect(mockApi.acceptIepGoals).toHaveBeenCalledWith("tok", "kid-1", [newGoal1]);
  });

  test("no centre picked -> centreId null (Home); no approved new goals -> acceptIepGoals not called", async () => {
    const { user, onBack } = renderUpload();
    await extract(user);
    await user.click(await screen.findByRole("button", { name: /Uses 3-word phrases/ }));
    await user.click(screen.getByRole("button", { name: "Add 2 approved" }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(mockApi.logEvidence).toHaveBeenCalledTimes(2);
    expect(mockApi.logEvidence.mock.calls[1][3]).toMatchObject({ centreId: null, newItemCustomText: undefined, measurementValue: 72.4 });
    expect(mockApi.acceptIepGoals).not.toHaveBeenCalled();
  });

  test("Saving... while in flight; a failure returns to review with the message (API vs generic)", async () => {
    const pending = deferred<never>();
    mockApi.logEvidence.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error("x"));
    const { user, onBack } = renderUpload();
    await extract(user);
    await user.click(await screen.findByRole("button", { name: "Add 3 approved" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    pending.reject(new ApiError(400, "Goal not found"));
    expect(await screen.findByText("Goal not found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add 3 approved" }));
    expect(await screen.findByText("Couldn't save some of these -- whatever saved before the failure is still saved.")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });

  test("Start over clears everything back to the picker", async () => {
    const { user } = renderUpload();
    await extract(user);
    await user.click(await screen.findByRole("button", { name: "Start over" }));
    expect(screen.getByText("Tap to choose a file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review with AI" })).toBeDisabled();
  });

  test("candidate measurement labels for every measurement type", async () => {
    const c = (o: Partial<EvidenceCandidate>) => makeEvidenceCandidate({ goalTitle: `T-${o.measurementType}-${o.measurementValue ?? o.measurementBoolean ?? o.measurementText ?? "none"}`, ...o });
    mockApi.extractIep.mockResolvedValue({
      statusUpdates: [
        c({ measurementType: "FREQUENCY", measurementValue: 4, measurementUnit: null }),
        c({ measurementType: "FREQUENCY", measurementValue: 2, measurementUnit: "words" }),
        c({ measurementType: "DURATION", measurementValue: 30 }),
        c({ measurementType: "DURATION", measurementValue: 180 }),
        c({ measurementType: "DURATION", measurementValue: 61 }),
        c({ measurementType: "RATING", measurementValue: 3 }),
        c({ measurementType: "YES_NO", measurementBoolean: true }),
        c({ measurementType: "YES_NO", measurementBoolean: false }),
        c({ measurementType: "YES_NO", measurementBoolean: null, outcome: "NOT_OBSERVED" }),
        c({ measurementType: "FREE_OBSERVATION", measurementText: "Calm at drop-off" }),
        c({ measurementType: "FREE_OBSERVATION", measurementText: null, outcome: "ODD" }),
        c({ measurementType: "PERCENTAGE", measurementValue: null, outcome: "INCORRECT", modality: "GESTURAL" })
      ],
      newGoals: []
    });
    const { user } = renderUpload();
    await extract(user);
    await screen.findByText(/Found 12 things/);
    const text = document.body.textContent!;
    for (const s of ["4 times", "2 words", "30 sec", "3 min", "1 min 1 sec", "Rated 3/5", "Yes ·", "Not yet ·", "Didn't get a chance", "Calm at drop-off", "ODD", "Not yet · Gestural"]) {
      expect(text, s).toContain(s);
    }
  });
});
