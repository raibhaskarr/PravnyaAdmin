import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../../api/client";
import { deferred } from "../../test/apiMock";
import { makeIepGoalCandidate } from "../../test/fixtures";
import { renderOnboarding } from "../../test/onboarding";

vi.mock("../../api/client", async (orig) => (await import("../../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const opts = { step: "child-iep" as const, token: "tok", kidId: "kid-1", draft: { childName: "Sam" } };
const pdf = () => new File(["hello"], "sam-iep.pdf", { type: "application/pdf" }); // base64 "aGVsbG8="
const fileInput = () => document.querySelector<HTMLInputElement>("input[type='file']")!;
const continueBtn = () => screen.getByRole("button", { name: "Continue" });

async function pickAndContinue(file: File = pdf()) {
  const user = userEvent.setup();
  await user.upload(fileInput(), file);
  await user.click(continueBtn());
  return user;
}

describe("ChildIep (onboarding)", () => {
  beforeEach(() => {
    mockApi.extractIep.mockResolvedValue({ statusUpdates: [], newGoals: [makeIepGoalCandidate({ title: "Goal one" }), makeIepGoalCandidate({ title: "Goal two", domainName: "Motor", skillName: "Grasping" })] });
    mockApi.acceptIepGoals.mockResolvedValue({ created: 2, skipped: 0 });
  });

  test("Continue is disabled until a file is chosen; the chosen file's name is shown", async () => {
    const user = userEvent.setup();
    renderOnboarding(opts);
    expect(screen.getByText("Tap to choose a file")).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();
    await user.upload(fileInput(), pdf());
    expect(screen.getByText("sam-iep.pdf")).toBeInTheDocument();
    expect(continueBtn()).toBeEnabled();
  });

  test("the drop-zone button opens the hidden file input", async () => {
    renderOnboarding(opts);
    const clickSpy = vi.spyOn(fileInput(), "click");
    await userEvent.click(screen.getByRole("button", { name: /Tap to choose a file/ }));
    expect(clickSpy).toHaveBeenCalled();
  });

  test("a PDF is sent as raw base64 (data-URL prefix stripped); found goals are listed for review", async () => {
    renderOnboarding(opts);
    await pickAndContinue();
    expect(await screen.findByText("We found 2 possible goals")).toBeInTheDocument();
    expect(mockApi.extractIep).toHaveBeenCalledWith("tok", "kid-1", { kind: "pdf", base64: "aGVsbG8=" });
    expect(screen.getByText("Goal one")).toBeInTheDocument();
    expect(screen.getByText("Motor · Grasping")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add these goals" })).toBeEnabled();
  });

  test("an image is sent with its mime type", async () => {
    renderOnboarding(opts);
    await pickAndContinue(new File(["img"], "page.png", { type: "image/png" }));
    await screen.findByText(/We found/);
    expect(mockApi.extractIep).toHaveBeenCalledWith("tok", "kid-1", { kind: "image", base64: "aW1n", mimeType: "image/png" });
  });

  test("Reading document... while extracting", async () => {
    mockApi.extractIep.mockReturnValue(new Promise(() => {}));
    renderOnboarding(opts);
    await pickAndContinue();
    expect(await screen.findByRole("button", { name: "Reading document..." })).toBeDisabled();
  });

  test("an extraction error from the AI is shown and you can pick again", async () => {
    mockApi.extractIep.mockResolvedValue({ error: "That doesn't look like an IEP." });
    renderOnboarding(opts);
    await pickAndContinue();
    expect(await screen.findByText("That doesn't look like an IEP.")).toBeInTheDocument();
    expect(continueBtn()).toBeEnabled();
  });

  test("no goals found -> explanation, stays on pick", async () => {
    mockApi.extractIep.mockResolvedValue({ statusUpdates: [], newGoals: [] });
    renderOnboarding(opts);
    await pickAndContinue();
    expect(await screen.findByText("We couldn't find any goals in this document -- you can add them manually later.")).toBeInTheDocument();
  });

  test("request failure -> generic message (even for ApiError)", async () => {
    mockApi.extractIep.mockRejectedValue(new ApiError(413, "Too large"));
    renderOnboarding(opts);
    await pickAndContinue();
    expect(await screen.findByText("Couldn't read that document. Try again, or skip for now.")).toBeInTheDocument();
  });

  test("Add these goals accepts exactly the extracted candidates and finishes onboarding", async () => {
    const { currentStep, optionalStatus } = renderOnboarding(opts);
    const user = await pickAndContinue();
    await user.click(await screen.findByRole("button", { name: "Add these goals" }));
    await waitFor(() => expect(currentStep()).toBe("done"));
    expect(mockApi.acceptIepGoals).toHaveBeenCalledWith("tok", "kid-1", [expect.objectContaining({ title: "Goal one" }), expect.objectContaining({ title: "Goal two" })]);
    expect(optionalStatus()["child-iep"]).toBe("answered");
  });

  test("singular copy for one goal; Saving... hides Not now", async () => {
    mockApi.extractIep.mockResolvedValue({ statusUpdates: [], newGoals: [makeIepGoalCandidate()] });
    const pending = deferred<{ created: number; skipped: number }>();
    mockApi.acceptIepGoals.mockReturnValue(pending.promise);
    renderOnboarding(opts);
    const user = await pickAndContinue();
    expect(await screen.findByText("We found 1 possible goal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add this goal" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Not now" })).not.toBeInTheDocument();
  });

  test("save error -> back to review with the message (API vs generic)", async () => {
    mockApi.acceptIepGoals.mockRejectedValueOnce(new ApiError(400, "Invalid candidate")).mockRejectedValueOnce(new Error("x"));
    const { currentStep } = renderOnboarding(opts);
    const user = await pickAndContinue();
    await user.click(await screen.findByRole("button", { name: "Add these goals" }));
    expect(await screen.findByText("Invalid candidate")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add these goals" }));
    expect(await screen.findByText("Couldn't save those goals. Try again.")).toBeInTheDocument();
    expect(currentStep()).toBe("child-iep");
  });

  test("Not now on review finishes without saving", async () => {
    const { currentStep } = renderOnboarding(opts);
    const user = await pickAndContinue();
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(currentStep()).toBe("done");
    expect(mockApi.acceptIepGoals).not.toHaveBeenCalled();
  });

  test("Skip for now records the skip without any upload", async () => {
    const { currentStep, optionalStatus } = renderOnboarding(opts);
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(currentStep()).toBe("done");
    expect(optionalStatus()["child-iep"]).toBe("skipped");
    expect(mockApi.extractIep).not.toHaveBeenCalled();
  });
});
