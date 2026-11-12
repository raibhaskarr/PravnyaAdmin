import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../../api/client";
import { deferred } from "../../test/apiMock";
import { renderOnboarding } from "../../test/onboarding";

// ChildGender (creates the kid), ChildTherapies, ChildSchedule, Done. ChildIep has its own file.

vi.mock("../../api/client", async (orig) => (await import("../../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const continueBtn = () => screen.getByRole("button", { name: "Continue" });
const skip = () => screen.getByRole("button", { name: "Skip for now" });
const createdKid = { id: "kid-new", firstName: "Sam", lastName: "Testchild", dob: "2021-03-04T00:00:00.000Z", gender: null };

describe("ChildGender -- creates the kid", () => {
  const draft = { childName: "Sam Testchild", childDob: "2021-03-04" };

  beforeEach(() => {
    mockApi.createFirstKid.mockResolvedValue(createdKid);
    mockApi.updateKid.mockResolvedValue({} as never);
  });

  test("Continue needs a choice; creates the kid with name, ISO dob and gender, then advances", async () => {
    const user = userEvent.setup();
    const { currentStep, optionalStatus } = renderOnboarding({ step: "child-gender", token: "tok", draft });
    expect(screen.getByText("What's Sam's gender?")).toBeInTheDocument();
    expect(screen.getByText("Almost there — a few optional details")).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Non-binary" }));
    expect(screen.getByRole("button", { name: "Non-binary" })).toHaveAttribute("aria-pressed", "true");
    await user.click(continueBtn());

    await waitFor(() => expect(currentStep()).toBe("child-therapies"));
    expect(mockApi.createFirstKid).toHaveBeenCalledWith("tok", { name: "Sam Testchild", dob: new Date("2021-03-04").toISOString(), gender: "Non-binary" });
    expect(optionalStatus()["child-gender"]).toBe("answered");
  });

  test("Skip still creates the kid, just without a gender, and records the skip", async () => {
    const user = userEvent.setup();
    const { currentStep, optionalStatus } = renderOnboarding({ step: "child-gender", token: "tok", draft });
    await user.click(skip());
    await waitFor(() => expect(currentStep()).toBe("child-therapies"));
    expect(mockApi.createFirstKid).toHaveBeenCalledWith("tok", { name: "Sam Testchild", dob: new Date("2021-03-04").toISOString() });
    expect(optionalStatus()["child-gender"]).toBe("skipped");
  });

  test("the created kid's id is what later steps patch", async () => {
    const user = userEvent.setup();
    renderOnboarding({ step: "child-gender", token: "tok", draft });
    await user.click(skip());
    await user.click(await screen.findByRole("button", { name: "ABA" }));
    await user.click(continueBtn());
    await waitFor(() => expect(mockApi.updateKid).toHaveBeenCalledWith("tok", "kid-new", { selfReportedTherapies: ["ABA"] }));
  });

  test("Saving... while in flight", async () => {
    const user = userEvent.setup();
    mockApi.createFirstKid.mockReturnValue(new Promise(() => {}));
    renderOnboarding({ step: "child-gender", token: "tok", draft: { ...draft, childGender: "Female" } });
    await user.click(continueBtn());
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });

  test("error on Continue: shown, stays on step, button re-enabled", async () => {
    const user = userEvent.setup();
    mockApi.createFirstKid.mockRejectedValue(new ApiError(500, "Self-registration isn't fully configured yet. Contact support."));
    const { currentStep } = renderOnboarding({ step: "child-gender", token: "tok", draft: { ...draft, childGender: "Female" } });
    await user.click(continueBtn());
    expect(await screen.findByText("Self-registration isn't fully configured yet. Contact support.")).toBeInTheDocument();
    expect(currentStep()).toBe("child-gender");
    expect(continueBtn()).toBeEnabled();
  });

  test("error on Skip: generic message, not skipped", async () => {
    const user = userEvent.setup();
    mockApi.createFirstKid.mockRejectedValue(new Error("offline"));
    const { currentStep, optionalStatus } = renderOnboarding({ step: "child-gender", token: "tok", draft });
    await user.click(skip());
    expect(await screen.findByText("Couldn't save that. Try again.")).toBeInTheDocument();
    expect(currentStep()).toBe("child-gender");
    expect(optionalStatus()["child-gender"]).toBe("pending");
  });

  // BUG: ChildGender calls createFirstKid every time it's submitted, even when a kid was already
  // created (kidId set). Going Back from Therapies to Gender and pressing Continue/Skip again
  // creates a SECOND kid (the backend's createFirstKid is an unconditional prisma.kid.create).
  // Expected: re-submitting the gender step should update the existing kid (or at least not
  // create another one).
  test.fails("BUG: going Back to the gender step and continuing again doesn't create a second kid", async () => {
    const user = userEvent.setup();
    renderOnboarding({ step: "child-gender", token: "tok", draft });
    await user.click(skip());
    await screen.findByText(/What kind of support/);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Male" }));
    await user.click(continueBtn());
    await screen.findByText(/What kind of support/);
    expect(mockApi.createFirstKid).toHaveBeenCalledTimes(1);
  });
});

describe.each([
  {
    step: "child-therapies" as const,
    title: "What kind of support does Sam get right now?",
    pick: ["Speech therapy", "Occupational therapy"],
    field: "selfReportedTherapies",
    next: "child-schedule"
  },
  {
    step: "child-schedule" as const,
    title: "Which days does Sam usually have therapy?",
    pick: ["Tue", "Sat"],
    field: "selfReportedScheduleDays",
    next: "child-iep"
  }
])("$step", ({ step, title, pick, field, next }) => {
  const opts = { step, token: "tok", kidId: "kid-new", draft: { childName: "Sam" } };

  beforeEach(() => {
    mockApi.updateKid.mockResolvedValue({} as never);
  });

  test("multi-select with toggle-off; Continue patches the kid and advances", async () => {
    const user = userEvent.setup();
    const { currentStep, optionalStatus } = renderOnboarding(opts);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();
    for (const p of pick) await user.click(screen.getByRole("button", { name: p }));
    // toggle the first off and back on -> order becomes [second, first]
    await user.click(screen.getByRole("button", { name: pick[0] }));
    expect(screen.getByRole("button", { name: pick[0] })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: pick[0] }));
    await user.click(continueBtn());
    await waitFor(() => expect(currentStep()).toBe(next));
    expect(mockApi.updateKid).toHaveBeenCalledWith("tok", "kid-new", { [field]: [pick[1], pick[0]] });
    expect(optionalStatus()[step]).toBe("answered");
  });

  test("Skip saves nothing and records the skip", async () => {
    const user = userEvent.setup();
    const { currentStep, optionalStatus } = renderOnboarding(opts);
    await user.click(skip());
    expect(currentStep()).toBe(next);
    expect(optionalStatus()[step]).toBe("skipped");
    expect(mockApi.updateKid).not.toHaveBeenCalled();
  });

  test("Saving... while in flight, then API error shown and step kept", async () => {
    const user = userEvent.setup();
    const pending = deferred<never>();
    mockApi.updateKid.mockReturnValue(pending.promise);
    const { currentStep } = renderOnboarding(opts);
    await user.click(screen.getByRole("button", { name: pick[0] }));
    await user.click(continueBtn());
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    pending.reject(new ApiError(404, "Kid not found"));
    expect(await screen.findByText("Kid not found")).toBeInTheDocument();
    expect(currentStep()).toBe(step);
  });

  test("non-API error -> generic message", async () => {
    const user = userEvent.setup();
    mockApi.updateKid.mockRejectedValue(new Error("offline"));
    renderOnboarding(opts);
    await user.click(screen.getByRole("button", { name: pick[0] }));
    await user.click(continueBtn());
    expect(await screen.findByText("Couldn't save that. Try again.")).toBeInTheDocument();
  });

  test("falls back to 'your child' without a name", () => {
    renderOnboarding({ ...opts, draft: {} });
    expect(screen.getByText(title.replace("Sam", "your child"))).toBeInTheDocument();
  });
});

describe("ChildGender name fallback", () => {
  test("'your child' without a name", () => {
    renderOnboarding({ step: "child-gender" });
    expect(screen.getByText("What's your child's gender?")).toBeInTheDocument();
  });
});

describe("Done", () => {
  test("reassures about skipped details by first name; Go to Home finishes with the token; no Back", async () => {
    const { onFinish } = renderOnboarding({ step: "done", token: "tok-done", draft: { childName: "Sam Testchild" } });
    expect(screen.getByText("You're all set")).toBeInTheDocument();
    expect(screen.getByText("Anything you skipped for Sam can be added anytime from Home -- no rush.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to Home" }));
    expect(onFinish).toHaveBeenCalledWith("tok-done");
  });
});
