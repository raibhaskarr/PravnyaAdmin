import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type CreateEvidenceInput } from "../api/client";
import { deferred } from "../test/apiMock";
import { makeGoal, makeItem } from "../test/fixtures";
import { LogEvidenceForm } from "./LogEvidenceForm";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const TODAY_ISO = "2026-11-12T00:00:00.000Z";

function renderForm(measurementType: string | null = null) {
  const goal = makeGoal({
    id: "goal-1",
    measurementType,
    items: [
      makeItem({ id: "item-custom", customText: "Says 'more'" }),
      makeItem({ id: "item-canon", canonicalSkillItem: { id: "c1", displayName: "Signs 'all done'" } }),
      makeItem({ id: "item-bare" }) // neither -> not offered as a chip
    ]
  });
  const onLogged = vi.fn();
  const onCancel = vi.fn();
  render(<LogEvidenceForm goal={goal} token="tok" kidId="kid-1" onLogged={onLogged} onCancel={onCancel} />);
  return { onLogged, onCancel, user: userEvent.setup() };
}

const save = () => screen.getByRole("button", { name: /^(Save|Saving\.\.\.)$/ });
const sentInput = () => mockApi.logEvidence.mock.calls.at(-1)![3] as CreateEvidenceInput;

const DEFAULTS: CreateEvidenceInput = {
  goalItemId: undefined,
  newItemCustomText: undefined,
  logDate: TODAY_ISO,
  outcome: "CORRECT",
  supportLevel: "INDEPENDENT",
  modality: "VERBAL",
  measurementValue: null,
  measurementUnit: null,
  measurementBoolean: null,
  measurementText: null
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T10:00:00.000Z"));
  mockApi.logEvidence.mockResolvedValue({} as never);
});
afterEach(() => vi.useRealTimers());

describe("<LogEvidenceForm />", () => {
  test("offers chips only for named items; defaults to today", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Says 'more'" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Signs 'all done'" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "General practice" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-12");
  });

  test("saving with defaults sends the default evidence for this goal and calls onLogged", async () => {
    const { user, onLogged } = renderForm();
    await user.click(save());
    expect(mockApi.logEvidence).toHaveBeenCalledWith("tok", "kid-1", "goal-1", DEFAULTS);
    expect(onLogged).toHaveBeenCalledOnce();
  });

  test("picking an existing item sends its id; typing a description switches to a new item (and vice versa)", async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole("button", { name: "Says 'more'" }));
    await user.click(save());
    expect(sentInput()).toMatchObject({ goalItemId: "item-custom", newItemCustomText: undefined });

    const desc = screen.getByPlaceholderText("Or describe what happened (optional)");
    await user.type(desc, "  Stacked 4 blocks  ");
    expect(screen.getByRole("button", { name: "Says 'more'" })).toHaveAttribute("aria-pressed", "false");
    await user.click(save());
    expect(sentInput()).toMatchObject({ goalItemId: undefined, newItemCustomText: "Stacked 4 blocks" });

    await user.click(screen.getByRole("button", { name: "Signs 'all done'" }));
    expect(desc).toHaveValue("");
    await user.click(save());
    expect(sentInput()).toMatchObject({ goalItemId: "item-canon", newItemCustomText: undefined });
  });

  test("whitespace-only description isn't sent as a new item", async () => {
    const { user } = renderForm();
    await user.type(screen.getByPlaceholderText("Or describe what happened (optional)"), "   ");
    await user.click(save());
    expect(sentInput().newItemCustomText).toBeUndefined();
  });

  test("date, result, support and modality choices are sent", async () => {
    const { user } = renderForm();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-01" } });
    await user.click(screen.getByRole("button", { name: "Gave it a try" }));
    await user.click(screen.getByRole("button", { name: "Physical prompt" }));
    await user.click(screen.getByRole("button", { name: "AAC" }));
    expect(screen.getByRole("button", { name: "Did it independently" })).toHaveAttribute("aria-pressed", "false");
    await user.click(save());
    expect(sentInput()).toMatchObject({ logDate: "2026-11-01T00:00:00.000Z", outcome: "ATTEMPTED", supportLevel: "PHYSICAL_PROMPT", modality: "AAC" });
  });

  test("no measurement fields for a goal without a measurement type", () => {
    renderForm(null);
    for (const label of ["How many times", "Minutes", "Percentage correct", "Rating (1-5)", "What happened"]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Completed?")).not.toBeInTheDocument();
  });

  describe("measurement-type fields", () => {
    test("FREQUENCY: count + unit (default 'times')", async () => {
      const { user } = renderForm("FREQUENCY");
      await user.click(save());
      expect(sentInput()).toMatchObject({ measurementValue: null, measurementUnit: "times" });
      await user.type(screen.getByLabelText("How many times"), "5");
      await user.clear(screen.getByLabelText("Unit"));
      await user.type(screen.getByLabelText("Unit"), "words");
      await user.click(save());
      expect(sentInput()).toMatchObject({ measurementValue: 5, measurementUnit: "words", measurementBoolean: null, measurementText: null });
    });

    test("DURATION: minutes + seconds -> total seconds; nothing entered -> null", async () => {
      const { user } = renderForm("DURATION");
      await user.click(save());
      expect(sentInput()).toMatchObject({ measurementValue: null, measurementUnit: "seconds" });
      await user.type(screen.getByLabelText("Minutes"), "2");
      await user.type(screen.getByLabelText("Seconds"), "15");
      await user.click(save());
      expect(sentInput()).toMatchObject({ measurementValue: 135, measurementUnit: "seconds" });
      await user.clear(screen.getByLabelText("Minutes"));
      await user.click(save());
      expect(sentInput().measurementValue).toBe(15);
    });

    test("PERCENTAGE", async () => {
      const { user } = renderForm("PERCENTAGE");
      await user.type(screen.getByLabelText("Percentage correct"), "80");
      await user.click(save());
      expect(sentInput()).toMatchObject({ measurementValue: 80, measurementUnit: null });
    });

    test("RATING", async () => {
      const { user } = renderForm("RATING");
      await user.type(screen.getByLabelText("Rating (1-5)"), "4");
      await user.click(save());
      expect(sentInput()).toMatchObject({ measurementValue: 4, measurementUnit: null });
    });

    test("YES_NO: unanswered -> null, Yes -> true, Not yet -> false", async () => {
      const { user } = renderForm("YES_NO");
      await user.click(save());
      expect(sentInput().measurementBoolean).toBeNull();
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await user.click(save());
      expect(sentInput().measurementBoolean).toBe(true);
      // "Not yet" also labels the INCORRECT result chip -- the Completed? one comes second.
      await user.click(screen.getAllByRole("button", { name: "Not yet" })[1]);
      await user.click(save());
      expect(sentInput()).toMatchObject({ measurementBoolean: false, outcome: "CORRECT" });
    });

    test("FREE_OBSERVATION: trimmed note, blank -> null", async () => {
      const { user } = renderForm("FREE_OBSERVATION");
      await user.type(screen.getByLabelText("What happened"), "   ");
      await user.click(save());
      expect(sentInput().measurementText).toBeNull();
      await user.type(screen.getByLabelText("What happened"), "Counted to 7  ");
      await user.click(save());
      expect(sentInput().measurementText).toBe("Counted to 7");
    });
  });

  test("Saving... disables the button while in flight", async () => {
    const pending = deferred<never>();
    mockApi.logEvidence.mockReturnValue(pending.promise);
    const { user } = renderForm();
    await user.click(save());
    expect(save()).toHaveTextContent("Saving...");
    expect(save()).toBeDisabled();
    pending.resolve(undefined as never);
    await vi.waitFor(() => expect(save()).toHaveTextContent("Save"));
  });

  test("API error message vs generic; onLogged not called", async () => {
    mockApi.logEvidence.mockRejectedValueOnce(new ApiError(400, "Date can't be in the future")).mockRejectedValueOnce(new Error("x"));
    const { user, onLogged } = renderForm();
    await user.click(save());
    expect(await screen.findByText("Date can't be in the future")).toBeInTheDocument();
    await user.click(save());
    expect(await screen.findByText("Couldn't save that. Try again.")).toBeInTheDocument();
    expect(onLogged).not.toHaveBeenCalled();
  });

  test("a cleared date fails locally with the generic message and never calls the API", async () => {
    const { user } = renderForm();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });
    await user.click(save());
    expect(await screen.findByText("Couldn't save that. Try again.")).toBeInTheDocument();
    expect(mockApi.logEvidence).not.toHaveBeenCalled();
  });

  test("Cancel", async () => {
    const { user, onCancel } = renderForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(mockApi.logEvidence).not.toHaveBeenCalled();
  });
});
