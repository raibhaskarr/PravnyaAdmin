import { render, screen, waitFor, within } from "@testing-library/react";
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
  mockApi.listTherapists.mockResolvedValue([]);
  mockApi.listTherapistInvitations.mockResolvedValue([]);
  mockApi.listCentres.mockResolvedValue([]);
});

describe("loading and session", () => {
  test("validates the token via /me and loads the kid's goals, thread and schedule", async () => {
    renderHome();
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(mockApi.me).toHaveBeenCalledWith("tok");
    expect(mockApi.listGoals).toHaveBeenCalledWith("tok", "kid-1");
    expect(mockApi.listCompanionMessages).toHaveBeenCalledWith("tok", "kid-1");
    expect(mockApi.listSchedule).toHaveBeenCalledWith("tok", "kid-1");
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
