import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type ScheduleSlot } from "../api/client";
import { deferred } from "../test/apiMock";
import { makeInvitation, makeSlot, makeTherapist } from "../test/fixtures";
import { Profile } from "./Profile";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const therapist = makeTherapist({ id: "th-1", name: "Dr. Example One", tenant: { id: "t1", name: "Example Therapy Group" } });
const pendingInv = makeInvitation({ id: "inv-pending", email: "pending@test.local", status: "PENDING", createdAt: "2026-11-01T10:00:00.000Z" });
const expiredInv = makeInvitation({ id: "inv-expired", email: "expired@test.local", status: "EXPIRED" });
const acceptedInv = makeInvitation({ id: "inv-accepted", email: "accepted@test.local", status: "ACCEPTED" });
const revokedInv = makeInvitation({ id: "inv-revoked", email: "revoked@test.local", status: "REVOKED" });
const slotTue = makeSlot({ id: "slot-tue", label: "Speech therapy", dayOfWeek: "Tue", startTime: "16:30", therapist: { id: "th-1", name: "Dr. Example One" } });
const slotSat = makeSlot({ id: "slot-sat", label: "ABA", dayOfWeek: "Sat", startTime: "00:05", therapist: null });

function renderProfile() {
  render(<Profile token="tok" kidId="kid-1" kidName="Sam" />);
  return userEvent.setup();
}
const loaded = () => screen.findByText("Care team");
const emailBox = () => screen.getByLabelText("Invite a therapist");
const careTeam = () => screen.getByText("Care team").closest("section")!;
const scheduleSection = () => screen.getByText("Schedule").closest("section")!;

beforeEach(() => {
  mockApi.listTherapists.mockResolvedValue([therapist]);
  mockApi.listTherapistInvitations.mockResolvedValue([pendingInv, expiredInv, acceptedInv, revokedInv]);
  mockApi.listSchedule.mockResolvedValue([slotTue, slotSat]);
  mockApi.inviteTherapist.mockResolvedValue({ linked: false, invitation: makeInvitation() });
  mockApi.revokeTherapistInvitation.mockResolvedValue(makeInvitation());
  mockApi.resendTherapistInvitation.mockResolvedValue({ invitation: makeInvitation() });
  mockApi.unlinkTherapist.mockResolvedValue(undefined);
  mockApi.createScheduleSlot.mockResolvedValue(makeSlot());
  mockApi.updateScheduleSlot.mockResolvedValue(makeSlot());
  mockApi.deleteScheduleSlot.mockResolvedValue(undefined);
});

describe("<Profile /> loading", () => {
  test("loads therapists, invitations and schedule for the kid", async () => {
    renderProfile();
    await loaded();
    for (const fn of [mockApi.listTherapists, mockApi.listTherapistInvitations, mockApi.listSchedule]) expect(fn).toHaveBeenCalledWith("tok", "kid-1");
  });

  test("any load failure shows one error (API message vs generic)", async () => {
    mockApi.listSchedule.mockRejectedValueOnce(new ApiError(403, "Forbidden kid"));
    const { unmount } = render(<Profile token="tok" kidId="kid-1" kidName="Sam" />);
    expect(await screen.findByText("Forbidden kid")).toBeInTheDocument();
    unmount();
    mockApi.listTherapists.mockRejectedValueOnce(new Error("x"));
    renderProfile();
    expect(await screen.findByText("Couldn't load the care team. Try again.")).toBeInTheDocument();
  });

  test("empty care team and schedule copy", async () => {
    mockApi.listTherapists.mockResolvedValue([]);
    mockApi.listTherapistInvitations.mockResolvedValue([acceptedInv, revokedInv]);
    mockApi.listSchedule.mockResolvedValue([]);
    renderProfile();
    expect(await screen.findByText("No one's linked to Sam's care team yet -- invite their therapist below.")).toBeInTheDocument();
    expect(screen.getByText("Nothing on Sam's schedule yet -- add a weekly slot below.")).toBeInTheDocument();
    // No therapists -> no therapist dropdown on the slot form.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("<Profile /> care team", () => {
  test("shows linked therapists and only actionable (pending/expired) invitations with the right actions", async () => {
    renderProfile();
    await loaded();
    const team = within(careTeam());
    expect(team.getByText("Dr. Example One")).toBeInTheDocument();
    expect(team.getByText("Example Therapy Group")).toBeInTheDocument();
    expect(team.queryByText("accepted@test.local")).not.toBeInTheDocument();
    expect(team.queryByText("revoked@test.local")).not.toBeInTheDocument();

    const pending = team.getByText("pending@test.local").closest("div.flex-col") as HTMLElement;
    expect(within(pending).getByText("Invite sent")).toBeInTheDocument();
    expect(within(pending).getByText(`Sent ${new Date(pendingInv.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`)).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: "Resend" })).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    const expired = team.getByText("expired@test.local").closest("div.flex-col") as HTMLElement;
    expect(within(expired).getByText("Expired")).toBeInTheDocument();
    expect(within(expired).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(within(expired).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  test("Invite is disabled for a blank email; inviting someone new sends the trimmed email, confirms, clears and refetches", async () => {
    const user = renderProfile();
    await loaded();
    const inviteBtn = () => screen.getByRole("button", { name: /^(Invite|Sending\.\.\.)$/ });
    expect(inviteBtn()).toBeDisabled();
    await user.type(emailBox(), "   ");
    expect(inviteBtn()).toBeDisabled();
    await user.clear(emailBox());

    const pending = deferred<{ linked: false; invitation: ReturnType<typeof makeInvitation> }>();
    mockApi.inviteTherapist.mockReturnValue(pending.promise);
    await user.type(emailBox(), " new.therapist@test.local ");
    await user.click(inviteBtn());
    expect(inviteBtn()).toHaveTextContent("Sending...");
    expect(inviteBtn()).toBeDisabled();
    pending.resolve({ linked: false, invitation: makeInvitation() });

    expect(await screen.findByText("Invite sent to new.therapist@test.local. They'll get an email to set up their account.")).toBeInTheDocument();
    expect(mockApi.inviteTherapist).toHaveBeenCalledWith("tok", "kid-1", "new.therapist@test.local");
    expect(emailBox()).toHaveValue("");
    await waitFor(() => expect(mockApi.listTherapists).toHaveBeenCalledTimes(2));
  });

  test("inviting an existing therapist links them straight away", async () => {
    mockApi.inviteTherapist.mockResolvedValue({ linked: true, therapist: makeTherapist() });
    const user = renderProfile();
    await loaded();
    await user.type(emailBox(), "existing@test.local{Enter}");
    expect(await screen.findByText("Found them -- added to Sam's care team.")).toBeInTheDocument();
  });

  test("invite errors: API message vs generic, email kept", async () => {
    mockApi.inviteTherapist.mockRejectedValueOnce(new ApiError(409, "Already invited")).mockRejectedValueOnce(new Error("x"));
    const user = renderProfile();
    await loaded();
    await user.type(emailBox(), "dup@test.local");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("Already invited")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("Couldn't send that invite. Try again.")).toBeInTheDocument();
    expect(emailBox()).toHaveValue("dup@test.local");
  });

  const actionCases = [
    { name: "Resend (pending)", email: "pending@test.local", button: "Resend", fn: "resendTherapistInvitation", id: "inv-pending", fallback: "Couldn't resend that invite. Try again." },
    { name: "Retry (expired)", email: "expired@test.local", button: "Retry", fn: "resendTherapistInvitation", id: "inv-expired", fallback: "Couldn't resend that invite. Try again." },
    { name: "Cancel (pending)", email: "pending@test.local", button: "Cancel", fn: "revokeTherapistInvitation", id: "inv-pending", fallback: "Couldn't cancel that invite. Try again." }
  ] as const;

  for (const c of actionCases) {
    test(`${c.name}: calls the API for that invitation, disables while busy, then refetches`, async () => {
      const pending = deferred<never>();
      mockApi[c.fn].mockReturnValueOnce(pending.promise);
      const user = renderProfile();
      await loaded();
      const card = screen.getByText(c.email).closest("div.flex-col") as HTMLElement;
      await user.click(within(card).getByRole("button", { name: c.button }));
      expect(mockApi[c.fn]).toHaveBeenCalledWith("tok", "kid-1", c.id);
      expect(within(card).getByRole("button", { name: c.button })).toBeDisabled();
      pending.resolve(undefined as never);
      await waitFor(() => expect(mockApi.listTherapistInvitations).toHaveBeenCalledTimes(2));
    });

    test(`${c.name}: errors (API vs generic)`, async () => {
      mockApi[c.fn].mockRejectedValueOnce(new ApiError(400, "Server says no")).mockRejectedValueOnce(new Error("x"));
      const user = renderProfile();
      await loaded();
      const card = () => screen.getByText(c.email).closest("div.flex-col") as HTMLElement;
      await user.click(within(card()).getByRole("button", { name: c.button }));
      expect(await screen.findByText("Server says no")).toBeInTheDocument();
      await user.click(within(card()).getByRole("button", { name: c.button }));
      expect(await screen.findByText(c.fallback)).toBeInTheDocument();
    });
  }

  test("Remove unlinks the therapist (Removing... while busy) and refetches", async () => {
    const pending = deferred<undefined>();
    mockApi.unlinkTherapist.mockReturnValueOnce(pending.promise);
    const user = renderProfile();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(mockApi.unlinkTherapist).toHaveBeenCalledWith("tok", "kid-1", "th-1");
    expect(screen.getByRole("button", { name: "Removing..." })).toBeDisabled();
    pending.resolve(undefined);
    await waitFor(() => expect(mockApi.listTherapists).toHaveBeenCalledTimes(2));
  });

  test("Remove errors (API vs generic)", async () => {
    mockApi.unlinkTherapist.mockRejectedValueOnce(new ApiError(404, "Not linked")).mockRejectedValueOnce(new Error("x"));
    const user = renderProfile();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Not linked")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Couldn't remove that therapist. Try again.")).toBeInTheDocument();
  });
});

describe("<Profile /> schedule", () => {
  const addBtn = () => screen.getByRole("button", { name: /^(Add to schedule|Save changes|Saving\.\.\.)$/ });
  const row = (text: string) => within(scheduleSection()).getByText(text).closest("div.rounded-2xl") as HTMLElement;

  test("rows show day, 12-hour time, label and linked therapist", async () => {
    renderProfile();
    await loaded();
    const s = within(scheduleSection());
    expect(s.getByText("Tue · 4:30 PM")).toBeInTheDocument();
    expect(s.getByText("Speech therapy — Dr. Example One")).toBeInTheDocument();
    expect(s.getByText("Sat · 12:05 AM")).toBeInTheDocument();
    expect(s.getAllByText("ABA").some((el) => el.tagName === "P")).toBe(true);
  });

  test("12-hour formatting edge cases (noon, midnight, morning)", async () => {
    mockApi.listSchedule.mockResolvedValue([makeSlot({ dayOfWeek: "Mon", startTime: "12:00" }), makeSlot({ dayOfWeek: "Wed", startTime: "00:00" }), makeSlot({ dayOfWeek: "Fri", startTime: "09:07" })]);
    renderProfile();
    await loaded();
    expect(screen.getByText("Mon · 12:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Wed · 12:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Fri · 9:07 AM")).toBeInTheDocument();
  });

  test("adding a slot with defaults (first label, Mon, 16:00, no therapist)", async () => {
    const user = renderProfile();
    await loaded();
    await user.click(addBtn());
    expect(mockApi.createScheduleSlot).toHaveBeenCalledWith("tok", "kid-1", { label: "Speech therapy", dayOfWeek: "Mon", startTime: "16:00", therapistId: undefined });
    await waitFor(() => expect(mockApi.listSchedule).toHaveBeenCalledTimes(2));
  });

  test("adding a slot with chosen label, day, time and therapist", async () => {
    const user = renderProfile();
    await loaded();
    const form = within(scheduleSection());
    await user.click(form.getByRole("button", { name: "Occupational therapy" }));
    await user.click(form.getByRole("button", { name: "Thu" }));
    await user.clear(screen.getByLabelText("Time"));
    await user.type(screen.getByLabelText("Time"), "09:30");
    await user.selectOptions(screen.getByRole("combobox"), "th-1");
    await user.click(addBtn());
    expect(mockApi.createScheduleSlot).toHaveBeenCalledWith("tok", "kid-1", { label: "Occupational therapy", dayOfWeek: "Thu", startTime: "09:30", therapistId: "th-1" });
  });

  test("Saving... while adding", async () => {
    mockApi.createScheduleSlot.mockReturnValue(new Promise(() => {}));
    const user = renderProfile();
    await loaded();
    await user.click(addBtn());
    expect(addBtn()).toHaveTextContent("Saving...");
    expect(addBtn()).toBeDisabled();
  });

  // There's no client-side duplicate check -- a duplicate slot is rejected by the server and its
  // message is what the parent sees.
  test("a duplicate slot shows the server's warning; generic message otherwise", async () => {
    mockApi.createScheduleSlot
      .mockRejectedValueOnce(new ApiError(409, "Sam already has Speech therapy on Mon at 16:00"))
      .mockRejectedValueOnce(new Error("x"));
    const user = renderProfile();
    await loaded();
    await user.click(addBtn());
    expect(await screen.findByText("Sam already has Speech therapy on Mon at 16:00")).toBeInTheDocument();
    await user.click(addBtn());
    expect(await screen.findByText("Couldn't add that slot. Try again.")).toBeInTheDocument();
  });

  test("Edit loads the slot into the form; Save changes PATCHes it and resets the form", async () => {
    const user = renderProfile();
    await loaded();
    await user.click(within(row("Tue · 4:30 PM")).getByRole("button", { name: "Edit" }));
    expect(within(row("Tue · 4:30 PM")).getByRole("button", { name: "Editing..." })).toBeInTheDocument();
    expect(screen.getByText("Editing this slot")).toBeInTheDocument();
    const form = within(scheduleSection());
    expect(form.getByRole("button", { name: "Tue" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Time")).toHaveValue("16:30");
    expect(screen.getByRole("combobox")).toHaveValue("th-1");

    await user.click(form.getByRole("button", { name: "Wed" }));
    await user.selectOptions(screen.getByRole("combobox"), "");
    await user.click(addBtn());
    expect(mockApi.updateScheduleSlot).toHaveBeenCalledWith("tok", "kid-1", "slot-tue", { label: "Speech therapy", dayOfWeek: "Wed", startTime: "16:30", therapistId: undefined });
    await waitFor(() => expect(screen.queryByText("Editing this slot")).not.toBeInTheDocument());
    expect(addBtn()).toHaveTextContent("Add to schedule");
    expect(screen.getByLabelText("Time")).toHaveValue("16:00");
  });

  test("editing a slot without a therapist selects 'No therapist linked'", async () => {
    const user = renderProfile();
    await loaded();
    await user.click(within(row("Sat · 12:05 AM")).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(within(scheduleSection()).getByRole("button", { name: "ABA" })).toHaveAttribute("aria-pressed", "true");
  });

  test("an edit failure says 'save that change'", async () => {
    mockApi.updateScheduleSlot.mockRejectedValue(new Error("x"));
    const user = renderProfile();
    await loaded();
    await user.click(within(row("Tue · 4:30 PM")).getByRole("button", { name: "Edit" }));
    await user.click(addBtn());
    expect(await screen.findByText("Couldn't save that change. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Editing this slot")).toBeInTheDocument();
  });

  test("Cancel leaves edit mode and restores defaults", async () => {
    const user = renderProfile();
    await loaded();
    await user.click(within(row("Tue · 4:30 PM")).getByRole("button", { name: "Edit" }));
    await user.click(within(scheduleSection()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Editing this slot")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Time")).toHaveValue("16:00");
    expect(within(scheduleSection()).getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
  });

  test("× deletes the slot and refetches", async () => {
    const user = renderProfile();
    await loaded();
    await user.click(within(row("Sat · 12:05 AM")).getByRole("button", { name: "Remove slot" }));
    expect(mockApi.deleteScheduleSlot).toHaveBeenCalledWith("tok", "kid-1", "slot-sat");
    await waitFor(() => expect(mockApi.listSchedule).toHaveBeenCalledTimes(2));
  });

  test("deleting the slot being edited also leaves edit mode", async () => {
    const user = renderProfile();
    await loaded();
    await user.click(within(row("Tue · 4:30 PM")).getByRole("button", { name: "Edit" }));
    mockApi.listSchedule.mockResolvedValue([slotSat] as ScheduleSlot[]);
    await user.click(within(row("Tue · 4:30 PM")).getByRole("button", { name: "Remove slot" }));
    await waitFor(() => expect(screen.queryByText("Editing this slot")).not.toBeInTheDocument());
  });

  test("deleting a different slot keeps the current edit", async () => {
    const user = renderProfile();
    await loaded();
    await user.click(within(row("Tue · 4:30 PM")).getByRole("button", { name: "Edit" }));
    await user.click(within(row("Sat · 12:05 AM")).getByRole("button", { name: "Remove slot" }));
    await waitFor(() => expect(mockApi.listSchedule).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Editing this slot")).toBeInTheDocument();
  });

  test("a failed delete is silent and leaves the slot listed", async () => {
    mockApi.deleteScheduleSlot.mockRejectedValue(new ApiError(500, "nope"));
    const user = renderProfile();
    await loaded();
    await user.click(within(row("Sat · 12:05 AM")).getByRole("button", { name: "Remove slot" }));
    await waitFor(() => expect(mockApi.deleteScheduleSlot).toHaveBeenCalled());
    expect(screen.getByText("Sat · 12:05 AM")).toBeInTheDocument();
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
    expect(mockApi.listSchedule).toHaveBeenCalledTimes(1);
  });
});
