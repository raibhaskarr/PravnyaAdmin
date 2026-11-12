import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../api/client";
import { deferred } from "../test/apiMock";
import { NudgeCard, type NudgeType } from "./nudges";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

function renderNudge(type: NudgeType) {
  const onResolved = vi.fn();
  const onDismiss = vi.fn();
  render(<NudgeCard type={type} kidId="kid-1" kidName="Sam" token="tok" onResolved={onResolved} onDismiss={onDismiss} />);
  return { onResolved, onDismiss };
}

const save = () => screen.getByRole("button", { name: "Save" });

describe("<NudgeCard />", () => {
  beforeEach(() => {
    mockApi.updateKid.mockResolvedValue({} as never);
  });

  test("therapies: multi-select, toggling off, then saves the selection", async () => {
    const user = userEvent.setup();
    const { onResolved } = renderNudge("therapies");
    expect(screen.getByText("What kind of support does Sam get right now?")).toBeInTheDocument();
    expect(save()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "ABA" }));
    await user.click(screen.getByRole("button", { name: "Speech therapy" }));
    await user.click(screen.getByRole("button", { name: "Physiotherapy" }));
    await user.click(screen.getByRole("button", { name: "Physiotherapy" }));
    expect(screen.getByRole("button", { name: "ABA" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Physiotherapy" })).toHaveAttribute("aria-pressed", "false");

    await user.click(save());
    expect(mockApi.updateKid).toHaveBeenCalledWith("tok", "kid-1", { selfReportedTherapies: ["ABA", "Speech therapy"] });
    expect(onResolved).toHaveBeenCalledOnce();
  });

  test("schedule: saves selected days", async () => {
    const user = userEvent.setup();
    const { onResolved } = renderNudge("schedule");
    expect(screen.getByText("Which days does Sam usually have therapy?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tue" }));
    await user.click(screen.getByRole("button", { name: "Thu" }));
    await user.click(save());
    expect(mockApi.updateKid).toHaveBeenCalledWith("tok", "kid-1", { selfReportedScheduleDays: ["Tue", "Thu"] });
    expect(onResolved).toHaveBeenCalled();
  });

  test("gender: single-select replaces the previous choice and saves one value", async () => {
    const user = userEvent.setup();
    renderNudge("gender");
    expect(screen.getByText("What's Sam's gender?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Male" }));
    await user.click(screen.getByRole("button", { name: "Female" }));
    expect(screen.getByRole("button", { name: "Male" })).toHaveAttribute("aria-pressed", "false");
    await user.click(save());
    expect(mockApi.updateKid).toHaveBeenCalledWith("tok", "kid-1", { gender: "Female" });
  });

  test("shows Saving... and disables Save while the request is in flight", async () => {
    const user = userEvent.setup();
    const pending = deferred<never>();
    mockApi.updateKid.mockReturnValue(pending.promise);
    renderNudge("gender");
    await user.click(screen.getByRole("button", { name: "Male" }));
    await user.click(save());
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    pending.resolve(undefined as never);
    expect(await screen.findByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("API error message is shown and onResolved isn't called", async () => {
    const user = userEvent.setup();
    mockApi.updateKid.mockRejectedValue(new ApiError(400, "Invalid gender"));
    const { onResolved } = renderNudge("gender");
    await user.click(screen.getByRole("button", { name: "Male" }));
    await user.click(save());
    expect(await screen.findByText("Invalid gender")).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });

  test("non-API error -> generic message", async () => {
    const user = userEvent.setup();
    mockApi.updateKid.mockRejectedValue(new Error("offline"));
    renderNudge("schedule");
    await user.click(screen.getByRole("button", { name: "Mon" }));
    await user.click(save());
    expect(await screen.findByText("Couldn't save that. Try again.")).toBeInTheDocument();
  });

  test("Not now dismisses without saving", async () => {
    const { onDismiss } = renderNudge("therapies");
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(mockApi.updateKid).not.toHaveBeenCalled();
  });
});
