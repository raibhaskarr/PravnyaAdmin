import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../api/client";
import { deferred } from "../test/apiMock";
import { CENTRE_A, goalWithEvidence, makeKid, makeMessage, makeProfile, makeSlot } from "../test/fixtures";
import { Home } from "./Home";

// Behaviour of the Home screen itself (composer, kid switcher, nudge, feed, opener, sub-screen
// navigation). Home.test.tsx covers the tab bar with an "everything returns []" mock; this file
// controls each api call per test.

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

function renderHome() {
  const onSessionExpired = vi.fn();
  const onSignOut = vi.fn();
  render(<Home token="tok" onSessionExpired={onSessionExpired} onSignOut={onSignOut} />);
  return { onSessionExpired, onSignOut };
}

const composer = () => screen.getByPlaceholderText("Ask a question, or tell me what happened...");
const sendButton = () => screen.getByRole("button", { name: /^(Send|\.\.\.)$/ });
const bottomBar = () => screen.getAllByRole("navigation").at(-1)!;

beforeEach(() => {
  mockApi.me.mockResolvedValue(makeProfile());
  mockApi.listGoals.mockResolvedValue([]);
  mockApi.listCompanionMessages.mockResolvedValue([]);
  mockApi.listSchedule.mockResolvedValue([]);
  mockApi.listUpdates.mockResolvedValue([]);
  mockApi.listIepPlans.mockResolvedValue([]);
  mockApi.listSessions.mockResolvedValue([]);
  mockApi.listVisualSchedules.mockResolvedValue({ credit: "", schedules: [] });
  mockApi.getPracticeStatus.mockResolvedValue({ perDay: 2, usedToday: 0, remainingToday: 2, inProgressRunId: null, available: false, minutes: null });
  mockApi.listTherapists.mockResolvedValue([]);
  mockApi.listTherapistInvitations.mockResolvedValue([]);
  mockApi.listCentres.mockResolvedValue([]);
});

describe("loading and session", () => {
  test("validates the token via /me and loads the kid's goals, thread and schedule", async () => {
    renderHome();
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(mockApi.me).toHaveBeenCalledWith("tok");
    // The kid's data loads in an effect after the profile renders -- wait for it, don't race it.
    await waitFor(() => {
      expect(mockApi.listGoals).toHaveBeenCalledWith("tok", "kid-1");
      expect(mockApi.listCompanionMessages).toHaveBeenCalledWith("tok", "kid-1");
      expect(mockApi.listSchedule).toHaveBeenCalledWith("tok", "kid-1");
    });
    expect(screen.getByText("Signed in as Test Parent")).toBeInTheDocument();
  });

  test("falls back to the email when the parent has no name", async () => {
    mockApi.me.mockResolvedValue(makeProfile({ name: null }));
    renderHome();
    expect(await screen.findByText("parent@test.local")).toBeInTheDocument();
  });

  test("a 401 from /me expires the session", async () => {
    mockApi.me.mockRejectedValue(new ApiError(401, "Unauthorized"));
    const { onSessionExpired } = renderHome();
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  });

  test("any other /me failure shows an error instead", async () => {
    mockApi.me.mockRejectedValue(new ApiError(500, "boom"));
    const { onSessionExpired } = renderHome();
    expect(await screen.findByText("Couldn't load your home. Try again.")).toBeInTheDocument();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  test("sign out button", async () => {
    const { onSignOut } = renderHome();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  test("shows a loading line until goals arrive, then the welcome prompt", async () => {
    const goals = deferred<never[]>();
    mockApi.listGoals.mockReturnValue(goals.promise);
    renderHome();
    expect(await screen.findByText("Loading Sam's updates...")).toBeInTheDocument();
    goals.resolve([]);
    expect(await screen.findByText("Welcome! Ask me anything about Sam, or tell me what you tried today.")).toBeInTheDocument();
  });

  test("goal/thread/schedule fetch failures degrade to empty rather than erroring", async () => {
    mockApi.listGoals.mockRejectedValue(new Error("x"));
    mockApi.listCompanionMessages.mockRejectedValue(new Error("x"));
    mockApi.listSchedule.mockRejectedValue(new Error("x"));
    renderHome();
    expect(await screen.findByText(/Welcome! Ask me anything about Sam/)).toBeInTheDocument();
  });

  test("a parent with no kids gets generic copy and tabs stay on the home shell", async () => {
    mockApi.me.mockResolvedValue(makeProfile({ kids: [] }));
    renderHome();
    expect(await screen.findByText("your child")).toBeInTheDocument();
    expect(mockApi.listGoals).not.toHaveBeenCalled();
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Growth/ }));
    expect(screen.queryByText("Growth", { selector: "header p" })).not.toBeInTheDocument();
  });
});

describe("conversation thread + composer", () => {
  test("renders the stored thread in order", async () => {
    mockApi.listCompanionMessages.mockResolvedValue([
      makeMessage({ role: "PARENT", content: "Is lining up toys normal?" }),
      makeMessage({ role: "ASSISTANT", content: "Lots of kids do this." })
    ]);
    renderHome();
    expect(await screen.findByText("Is lining up toys normal?")).toBeInTheDocument();
    expect(screen.getByText("Lots of kids do this.")).toBeInTheDocument();
    expect(screen.queryByText(/Welcome! Ask me anything/)).not.toBeInTheDocument();
  });

  test("Send is disabled for empty/whitespace input", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText("Sam");
    expect(sendButton()).toBeDisabled();
    await user.type(composer(), "   ");
    expect(sendButton()).toBeDisabled();
  });

  test("a question: sends trimmed text, clears the box, and appends both sides of the exchange", async () => {
    const user = userEvent.setup();
    mockApi.sendCompanionMessage.mockResolvedValue({ intent: "question", reply: "Try short, simple choices." });
    renderHome();
    await screen.findByText("Sam");
    await user.type(composer(), "  How do I help with choices?  ");
    await user.click(sendButton());

    expect(mockApi.sendCompanionMessage).toHaveBeenCalledWith("tok", "kid-1", "How do I help with choices?");
    expect(await screen.findByText("Try short, simple choices.")).toBeInTheDocument();
    expect(screen.getByText("How do I help with choices?")).toBeInTheDocument();
    expect(composer()).toHaveValue("");
  });

  test("Enter submits too, and the box is disabled while sending", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ intent: "question"; reply: string }>();
    mockApi.sendCompanionMessage.mockReturnValue(pending.promise);
    renderHome();
    await screen.findByText("Sam");
    await user.type(composer(), "Hello{Enter}");
    expect(composer()).toBeDisabled();
    expect(sendButton()).toHaveTextContent("...");
    pending.resolve({ intent: "question", reply: "Hi!" });
    expect(await screen.findByText("Hi!")).toBeInTheDocument();
    expect(composer()).toBeEnabled();
  });

  test("a 'log' intent opens Log session pre-filled with what was typed; Back refetches Home", async () => {
    const user = userEvent.setup();
    mockApi.sendCompanionMessage.mockResolvedValue({ intent: "log" });
    renderHome();
    await screen.findByText("Sam");
    await user.type(composer(), "Sam said 'more' at lunch");
    await user.click(sendButton());

    expect(await screen.findByText("What happened?")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Sam said 'more' at lunch");

    mockApi.listCompanionMessages.mockResolvedValue([makeMessage({ role: "PARENT", content: "Sam said 'more' at lunch" })]);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Sam said 'more' at lunch")).toBeInTheDocument();
    expect(mockApi.listGoals).toHaveBeenCalledTimes(2);
    expect(mockApi.listCompanionMessages).toHaveBeenCalledTimes(2);
    expect(mockApi.listSchedule).toHaveBeenCalledTimes(2);
  });

  test("a send failure puts the text back so nothing is lost", async () => {
    const user = userEvent.setup();
    mockApi.sendCompanionMessage.mockRejectedValue(new ApiError(500, "AI down"));
    const { onSessionExpired } = renderHome();
    await screen.findByText("Sam");
    await user.type(composer(), "Keep this text");
    await user.click(sendButton());
    await waitFor(() => expect(composer()).toHaveValue("Keep this text"));
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  test("a 401 while sending expires the session", async () => {
    const user = userEvent.setup();
    mockApi.sendCompanionMessage.mockRejectedValue(new ApiError(401, "expired"));
    const { onSessionExpired } = renderHome();
    await screen.findByText("Sam");
    await user.type(composer(), "Hello");
    await user.click(sendButton());
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  });

  test("the camera button opens Log session with an empty box", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole("button", { name: "Log with a photo or voice note" }));
    expect(await screen.findByText("What happened?")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});

describe("kid switcher", () => {
  const twoKids = () => makeProfile({ kids: [makeKid({ id: "kid-1", firstName: "Sam" }), makeKid({ id: "kid-2", firstName: "Riya" })] });

  test("a single kid shows a plain name, not a switcher", async () => {
    renderHome();
    const name = await screen.findByText("Sam");
    expect(name.tagName).toBe("P");
  });

  test("with 2+ kids, picking another kid reloads everything for that kid", async () => {
    const user = userEvent.setup();
    mockApi.me.mockResolvedValue(twoKids());
    renderHome();
    const switcher = await screen.findByRole("button", { name: "Sam" });
    await user.click(switcher);
    // Open menu: both kids listed, current one checked.
    expect(screen.getAllByRole("button", { name: /Sam/ })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Riya" }));

    expect(await screen.findByRole("button", { name: "Riya" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sam/ })).not.toBeInTheDocument();
    await waitFor(() => expect(mockApi.listGoals).toHaveBeenLastCalledWith("tok", "kid-2"));
    expect(mockApi.listCompanionMessages).toHaveBeenLastCalledWith("tok", "kid-2");
    expect(mockApi.listSchedule).toHaveBeenLastCalledWith("tok", "kid-2");
  });

  test("the menu closes when tapping outside it", async () => {
    const user = userEvent.setup();
    mockApi.me.mockResolvedValue(twoKids());
    renderHome();
    await user.click(await screen.findByRole("button", { name: "Sam" }));
    expect(screen.getByRole("button", { name: "Riya" })).toBeInTheDocument();
    // The full-screen backdrop is aria-hidden, so query it directly.
    await user.click(document.querySelector("button[aria-hidden='true']")!);
    expect(screen.queryByRole("button", { name: "Riya" })).not.toBeInTheDocument();
  });

  test("the selected kid's tabs are scoped to that kid", async () => {
    const user = userEvent.setup();
    mockApi.me.mockResolvedValue(twoKids());
    renderHome();
    await user.click(await screen.findByRole("button", { name: "Sam" }));
    await user.click(screen.getByRole("button", { name: "Riya" }));
    await user.click(within(bottomBar()).getByRole("button", { name: /Profile/ }));
    await waitFor(() => expect(mockApi.listTherapists).toHaveBeenCalledWith("tok", "kid-2"));
  });
});

describe("nudge", () => {
  test("shows the most useful missing-detail nudge; saving refetches /me and it goes away", async () => {
    const user = userEvent.setup();
    mockApi.me.mockResolvedValueOnce(makeProfile({ kids: [makeKid({ selfReportedTherapies: [] })] }));
    mockApi.updateKid.mockResolvedValue({} as never);
    renderHome();
    expect(await screen.findByText("What kind of support does Sam get right now?")).toBeInTheDocument();
    // No welcome card while a nudge is up.
    expect(screen.queryByText(/Welcome! Ask me anything/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ABA" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockApi.me).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("What kind of support does Sam get right now?")).not.toBeInTheDocument();
  });

  test("Not now hides it for this session", async () => {
    const user = userEvent.setup();
    mockApi.me.mockResolvedValue(makeProfile({ kids: [makeKid({ gender: null })] }));
    renderHome();
    expect(await screen.findByText("What's Sam's gender?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText("What's Sam's gender?")).not.toBeInTheDocument();
    expect(screen.getByText(/Welcome! Ask me anything/)).toBeInTheDocument();
  });
});

describe("feed + opener", () => {
  const d = (day: number) => `2026-11-${String(day).padStart(2, "0")}T09:00:00.000Z`;

  afterEach(() => vi.useRealTimers());

  test("feed cards render from goals and navigate to the matching tab", async () => {
    const user = userEvent.setup();
    mockApi.listGoals.mockResolvedValue([goalWithEvidence([{ centre: CENTRE_A, outcome: "PARTIAL", logDate: d(1) }], { title: "Waves hello" })]);
    renderHome();
    expect(await screen.findByText("Growth highlight")).toBeInTheDocument();
    expect(screen.getByText("Try this at home")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Try this at home/ }));
    expect(await screen.findByText("Activities", { selector: "header p" })).toBeInTheDocument();
  });

  test("a new milestone opener links to Growth", async () => {
    const user = userEvent.setup();
    mockApi.listGoals.mockResolvedValue([goalWithEvidence([{ outcome: "CORRECT", logDate: d(1) }], { title: "Waves hello" })]);
    renderHome();
    expect(await screen.findByText("Sam first independent success — nice work!")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "See Growth" }));
    expect(await screen.findByText("Growth", { selector: "header p" })).toBeInTheDocument();
  });

  test("a due session opener's 'Log it' opens Log session seeded with the session", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 11, 17, 0)); // a Wednesday
    const user = userEvent.setup();
    mockApi.listSchedule.mockResolvedValue([makeSlot({ label: "ABA", dayOfWeek: "Wed", startTime: "15:00" })]);
    renderHome();
    expect(await screen.findByText("Looks like Sam had ABA today — want to jot down how it went?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log it" }));
    expect(await screen.findByRole("textbox")).toHaveValue("ABA today");
  });
});

describe("Goals -> IEP upload sub-screen", () => {
  test("Upload IEP takes over the screen and Back returns to the Goals tab", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText("Sam");
    await user.click(within(bottomBar()).getByRole("button", { name: /Goals/ }));
    await user.click(await screen.findByRole("button", { name: "Upload IEP" }));
    expect(screen.getByText(/Upload an IEP document/)).toBeInTheDocument();
    expect(screen.queryAllByRole("navigation")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Goals", { selector: "header p" })).toBeInTheDocument();
  });

  test("the wide-screen left rail navigates too", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText("Sam");
    const rail = screen.getAllByRole("navigation")[0];
    await user.click(within(rail).getByRole("button", { name: /Profile/ }));
    expect(await screen.findByText("Profile", { selector: "header p" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: /Profile/ })).toHaveAttribute("aria-current", "page");
  });

  test("re-selecting the current tab does nothing", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText("Sam");
    await user.click(within(bottomBar()).getByRole("button", { name: /Home/ }));
    expect(mockApi.listGoals).toHaveBeenCalledTimes(1);
  });
});

describe("progress updates from the care team", () => {
  const update = (over: Partial<import("../api/client").ProgressUpdate> = {}) => ({
    id: "upd-1",
    authorName: "Speech Therapist",
    centreName: "Sunrise Centre",
    language: "en" as const,
    periodStart: "2026-11-09T00:00:00.000Z",
    periodEnd: "2026-11-16T00:00:00.000Z",
    body: "Sam had a lovely week.\n\nTry at home\n• Pause before giving a snack.",
    sentAt: new Date().toISOString(),
    readAt: null,
    ...over
  });

  test("an unread update shows on Home; opening it lists it in full and marks it read", async () => {
    mockApi.listUpdates.mockResolvedValue([update()]);
    mockApi.markUpdateRead.mockResolvedValue(update({ readAt: new Date().toISOString() }));
    renderHome();
    expect(await screen.findByText("Update from Speech Therapist · Sunrise Centre")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Read the update/ }));
    expect(await screen.findByText("Updates about Sam")).toBeInTheDocument();
    expect(screen.getByText(/Pause before giving a snack/)).toBeInTheDocument();
    await waitFor(() => expect(mockApi.markUpdateRead).toHaveBeenCalledWith("tok", "kid-1", "upd-1"));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Update from Speech Therapist · Sunrise Centre")).toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  test("an old, already-read update no longer shows on Home", async () => {
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
    mockApi.listUpdates.mockResolvedValue([update({ sentAt: old, readAt: old })]);
    renderHome();
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    await waitFor(() => expect(mockApi.listUpdates).toHaveBeenCalledWith("tok", "kid-1"));
    expect(screen.queryByText(/Update from Speech Therapist/)).not.toBeInTheDocument();
  });
});

describe("IEPs shared by the care team", () => {
  const plan = (over: Partial<import("../api/client").IepPlan> = {}) => ({
    id: "iep-1",
    title: "Individualised Education Plan",
    authorName: "Speech Therapist",
    centreName: "Sunrise Centre",
    planStart: "2026-11-16T00:00:00.000Z",
    reviewDate: "2027-02-15T00:00:00.000Z",
    content: {
      presentLevels: "Sam asks for some things with two words.",
      strengths: ["Asked for a ball without help for the first time"],
      goals: [{ goalId: "g-1", title: "Request items with two words", area: "Expressive Language", baseline: "Correct in 7 of 18 attempts.", target: "Asks with two words in 4 of 5 opportunities.", strategies: ["Wait time"], homePractice: ["Pause before giving a snack"] }],
      notes: ""
    },
    sharedAt: new Date().toISOString(),
    readAt: null,
    ...over
  });

  test("an unread plan shows on Home; opening it shows the goals and targets and marks it read", async () => {
    mockApi.listIepPlans.mockResolvedValue([plan()]);
    mockApi.markIepPlanRead.mockResolvedValue(plan({ readAt: new Date().toISOString() }));
    renderHome();
    expect(await screen.findByText("Sam's plan from Speech Therapist · Sunrise Centre")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /See the plan/ }));
    expect(await screen.findByText("Sam's plan")).toBeInTheDocument();
    expect(screen.getByText("Asks with two words in 4 of 5 opportunities.")).toBeInTheDocument();
    expect(screen.getByText("Pause before giving a snack")).toBeInTheDocument();
    await waitFor(() => expect(mockApi.markIepPlanRead).toHaveBeenCalledWith("tok", "kid-1", "iep-1"));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Sam");
    expect(screen.queryByText(/Sam's plan from/)).not.toBeInTheDocument();
  });

  test("a read plan stays reachable from the Goals tab", async () => {
    mockApi.listIepPlans.mockResolvedValue([plan({ readAt: new Date().toISOString() })]);
    renderHome();
    await screen.findByText("Sam");
    await waitFor(() => expect(mockApi.listIepPlans).toHaveBeenCalledWith("tok", "kid-1"));
    expect(screen.queryByText(/Sam's plan from/)).not.toBeInTheDocument();
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Goals/ }));
    expect(await screen.findByText("Sam's plan from Speech Therapist · Sunrise Centre")).toBeInTheDocument();
  });
});

describe("your account: download my data, delete my account", () => {
  async function openAccount() {
    renderHome();
    await screen.findByText("Sam");
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Profile/ }));
    return screen.findByText("Your account");
  }

  test("download opens the short-lived export link", async () => {
    mockApi.dataExportLink.mockResolvedValue({ path: "/api/parent-account/export?token=abc", expiresInMinutes: 5 });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    await openAccount();
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringMatching(/\/api\/parent-account\/export\?token=abc$/)));
    vi.unstubAllGlobals();
  });

  test("delete explains what happens, needs the password, then shows the date and a way back", async () => {
    const date = "2026-12-16T10:00:00.000Z";
    mockApi.requestAccountDeletion.mockRejectedValueOnce(new ApiError(401, "That password isn't right"));
    mockApi.requestAccountDeletion.mockResolvedValueOnce({ scheduledPurgeAt: date });
    await openAccount();
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(screen.getByText(/You have 30 days to change your mind/)).toBeInTheDocument();
    expect(screen.getByText(/the centre keeps its own therapy records/)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Delete my account" });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Enter your password to confirm"), "wrong");
    await userEvent.click(confirm);
    expect(await screen.findByText("That password isn't right")).toBeInTheDocument();

    mockApi.me.mockResolvedValue(makeProfile({ scheduledPurgeAt: date }));
    await userEvent.clear(screen.getByLabelText("Enter your password to confirm"));
    await userEvent.type(screen.getByLabelText("Enter your password to confirm"), "right");
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(mockApi.requestAccountDeletion).toHaveBeenLastCalledWith("tok", "right"));
    expect(await screen.findByText(/Your account will be deleted on/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep my account" })).toBeInTheDocument();
  });

  test("while deletion is pending, Home shows a banner; Keep my account cancels it", async () => {
    mockApi.me.mockResolvedValue(makeProfile({ scheduledPurgeAt: "2026-12-16T10:00:00.000Z" }));
    mockApi.cancelAccountDeletion.mockResolvedValue({ cancelled: true });
    renderHome();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Your account will be deleted on/);
    mockApi.me.mockResolvedValue(makeProfile());
    await userEvent.click(screen.getByRole("button", { name: "Keep my account" }));
    await waitFor(() => expect(mockApi.cancelAccountDeletion).toHaveBeenCalledWith("tok"));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("guided sessions from the therapist", () => {
  const session = (over: Partial<import("../api/client").HomeSessionSummary> = {}): import("../api/client").HomeSessionSummary => ({
    id: "s-1",
    title: "Naming game",
    authorName: "Speech Therapist",
    centreName: "Sunrise Centre",
    schedule: { kind: "weekly", days: ["Mon", "Wed"], until: null },
    activities: ["Name familiar objects", "Greet familiar adults"],
    dueToday: true,
    inProgressRunId: null,
    lastRun: null,
    ...over
  });

  test("a session due today shows on Home and opens the session screen; it's also listed on Activities", async () => {
    mockApi.listSessions.mockResolvedValue([session()]);
    mockApi.startSession.mockResolvedValue({
      runId: "run-1",
      title: "Naming game",
      step: { phase: "intro", activityTitle: null, activityLabel: null, feedback: null, guide: null, report: null, item: null, lines: ["Let's play!"], choices: [{ id: "ready", label: "We're ready" }], progress: { done: 0, total: 4 } },
      resumed: false
    });
    renderHome();
    expect(await screen.findByText("Today's session for Sam")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Start the session/ }));
    expect(await screen.findByText("Let's play!")).toBeInTheDocument();
    expect(mockApi.startSession).toHaveBeenCalledWith("tok", "kid-1", "s-1");
    expect(screen.getByRole("button", { name: "End" })).toBeInTheDocument();
  });

  test("Activities lists the therapist's sessions with Start or Continue", async () => {
    mockApi.listSessions.mockResolvedValue([session({ dueToday: false, inProgressRunId: "run-9", lastRun: { id: "r", status: "COMPLETED", startedAt: "2026-11-10T10:00:00.000Z", endedAt: "2026-11-10T10:12:00.000Z", summary: null } })]);
    renderHome();
    await screen.findByText("Sam");
    expect(await screen.findByText("Today's session for Sam")).toBeInTheDocument();
    expect(screen.getByText("Continue the session")).toBeInTheDocument();
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Activities/ }));
    expect(await screen.findByText("Sessions from your therapist")).toBeInTheDocument();
    expect(screen.getByText("Naming game")).toBeInTheDocument();
    expect(screen.getByText(/Every Mon, Wed/)).toBeInTheDocument();
    expect(screen.getByText(/Last done/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
});

describe("picture schedules", () => {
  const schedule = (over: Partial<import("../api/client").VisualSchedule> = {}): import("../api/client").VisualSchedule => ({
    id: "vs-1",
    title: "Brushing teeth",
    kind: "ROUTINE",
    language: "en",
    authorName: "Dr Rao",
    centreName: "Sunrise Centre",
    source: "THERAPIST",
    mine: false,
    days: [],
    time: null,
    remind: true,
    timing: { time: null, days: [], source: null },
    forToday: true,
    doneToday: false,
    startedToday: false,
    dueNow: false,
    minutesUntil: null,
    steps: [
      { key: "a", label: "Toothpaste", say: null, picture: { kind: "symbol", symbolId: "a", url: "https://cdn.example/a.svg" }, minutes: null },
      { key: "b", label: "Brush teeth", say: null, picture: null, minutes: 2 }
    ],
    ...over
  });

  test("today's schedules show on Home and open full screen; Activities lists every schedule", async () => {
    mockApi.listVisualSchedules.mockResolvedValue({ credit: "", schedules: [schedule(), schedule({ id: "vs-2", title: "Weekend park", days: ["Sat"], forToday: false })] });
    renderHome();
    expect(await screen.findByText("Sam's picture schedules")).toBeInTheDocument();
    expect(screen.queryByText("Weekend park")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Brushing teeth/ }));
    expect(await screen.findByText("Now · 1/2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Activities/ }));
    expect(await screen.findByText("Picture schedules")).toBeInTheDocument();
    expect(screen.getByText("Weekend park")).toBeInTheDocument();
  });

  test("a tapped reminder (/?kid=..&schedule=..) opens that schedule; 'Make one' opens the maker", async () => {
    mockApi.listVisualSchedules.mockResolvedValue({ credit: "", schedules: [schedule()] });
    window.history.replaceState(null, "", "/?kid=kid-1&schedule=vs-1");
    renderHome();
    expect(await screen.findByText("Now · 1/2")).toBeInTheDocument();
    expect(window.location.search).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Activities/ }));
    await userEvent.click(await screen.findByRole("button", { name: "+ Make one" }));
    expect(screen.getByText("Make a picture schedule")).toBeInTheDocument();
  });
});

describe("practice sessions with Pravnya", () => {
  const status = (over: Partial<import("../api/client").PracticeStatus> = {}): import("../api/client").PracticeStatus => ({
    perDay: 2,
    usedToday: 0,
    remainingToday: 2,
    inProgressRunId: null,
    available: true,
    minutes: 13,
    ...over
  });

  test("Activities offers one; starting asks Pravnya in the chosen language and opens the session", async () => {
    try {
      localStorage.removeItem("pv.practice.language");
    } catch {
      // ignore
    }
    mockApi.getPracticeStatus.mockResolvedValue(status());
    mockApi.startPractice.mockResolvedValue({
      runId: "run-p",
      title: "Sam के साथ अभ्यास",
      step: { phase: "intro", activityTitle: null, activityLabel: null, feedback: null, guide: null, report: null, item: null, lines: ["आज खेलेंगे!"], choices: [{ id: "ready", label: "हम तैयार हैं" }], progress: { done: 0, total: 24 } },
      resumed: false
    });
    renderHome();
    await screen.findByText("Sam");
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Activities/ }));
    expect(await screen.findByText("Practice with Pravnya")).toBeInTheDocument();
    expect(screen.getByText(/about 13 minutes/)).toBeInTheDocument();
    expect(screen.getByText("2 of 2 left today")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "हिन्दी" }));
    await userEvent.click(screen.getByRole("button", { name: "Start practice" }));
    expect(await screen.findByText("आज खेलेंगे!")).toBeInTheDocument();
    expect(mockApi.startPractice).toHaveBeenCalledWith("tok", "kid-1", "hi");
    expect(mockApi.startSession).not.toHaveBeenCalled();
  });

  test("one left halfway says Continue; after today's two, come back tomorrow; nothing to practise hides it", async () => {
    mockApi.getPracticeStatus.mockResolvedValue(status({ usedToday: 1, remainingToday: 1, inProgressRunId: "run-p" }));
    renderHome();
    await screen.findByText("Sam");
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Activities/ }));
    expect(await screen.findByRole("button", { name: "Continue practice" })).toBeInTheDocument();
    expect(screen.getByText(/You left one halfway/)).toBeInTheDocument();
    cleanup();

    mockApi.getPracticeStatus.mockResolvedValue(status({ usedToday: 2, remainingToday: 0 }));
    renderHome();
    await screen.findByText("Sam");
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Activities/ }));
    expect(await screen.findByText(/That's today's 2 practice sessions done/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start practice" })).not.toBeInTheDocument();
    cleanup();

    mockApi.getPracticeStatus.mockResolvedValue(status({ available: false }));
    renderHome();
    await screen.findByText("Sam");
    await userEvent.click(within(bottomBar()).getByRole("button", { name: /Activities/ }));
    await screen.findByText(/Activities/, { selector: "p" });
    expect(screen.queryByText("Practice with Pravnya")).not.toBeInTheDocument();
  });
});
