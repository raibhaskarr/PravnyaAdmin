import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../api/client";
import { CENTRE_A, makeEvidence, makeGoal, makeItem } from "../test/fixtures";
import { Goals } from "./Goals";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const d = (day: number) => `2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function renderGoals() {
  const onUploadIep = vi.fn();
  render(<Goals token="tok" kidId="kid-1" onUploadIep={onUploadIep} />);
  return { onUploadIep, user: userEvent.setup() };
}

const iepGoal = () =>
  makeGoal({
    id: "goal-iep",
    title: "Requests help",
    domainName: "Communication",
    skillName: "Requesting",
    createdById: null,
    items: [
      makeItem({ customText: "Says help", evidence: [makeEvidence({ logDate: d(3), outcome: "PARTIAL", centre: CENTRE_A })] }),
      makeItem({ canonicalSkillItem: { id: "c", displayName: "Taps shoulder" }, evidence: [makeEvidence({ logDate: d(9), outcome: "CORRECT", centre: null })] }),
      makeItem({ evidence: [makeEvidence({ logDate: null, outcome: "MYSTERY" })] })
    ]
  });
const careTeamGoal = () =>
  makeGoal({ id: "goal-team", title: "Climbs stairs", status: "ACHIEVED", createdById: "staff-1", items: [makeItem({ evidence: [makeEvidence()] })], discipline: { id: "pt", name: "Physiotherapy" } });

beforeEach(() => {
  mockApi.listGoals.mockResolvedValue([iepGoal(), careTeamGoal()]);
  mockApi.logEvidence.mockResolvedValue({} as never);
});

describe("<Goals /> list", () => {
  test("lists each goal with mapping tag, entry count and provenance; status badge only when not active", async () => {
    renderGoals();
    const iep = await screen.findByRole("button", { name: /Requests help/ });
    expect(mockApi.listGoals).toHaveBeenCalledWith("tok", "kid-1");
    expect(iep).toHaveTextContent("Communication › Requesting");
    expect(iep).toHaveTextContent("3 entries · From your IEP upload");
    expect(within(iep).queryByText("Active")).not.toBeInTheDocument();

    const team = screen.getByRole("button", { name: /Climbs stairs/ });
    expect(team).toHaveTextContent("Achieved");
    expect(team).toHaveTextContent("1 entry · Added by your care team");
  });

  test("Discontinued badge", async () => {
    mockApi.listGoals.mockResolvedValue([makeGoal({ title: "Old goal", status: "DISCONTINUED" })]);
    renderGoals();
    expect(await screen.findByText("Discontinued")).toBeInTheDocument();
    expect(screen.getByText(/0 entries/)).toBeInTheDocument();
  });

  test("empty state", async () => {
    mockApi.listGoals.mockResolvedValue([]);
    renderGoals();
    expect(await screen.findByText(/Goals show up here once they're added/)).toBeInTheDocument();
  });

  test("API error vs generic error", async () => {
    mockApi.listGoals.mockRejectedValueOnce(new ApiError(404, "Kid not found"));
    const { unmount } = render(<Goals token="tok" kidId="kid-1" onUploadIep={vi.fn()} />);
    expect(await screen.findByText("Kid not found")).toBeInTheDocument();
    unmount();
    mockApi.listGoals.mockRejectedValueOnce(new Error("x"));
    renderGoals();
    expect(await screen.findByText("Couldn't load goals. Try again.")).toBeInTheDocument();
  });

  test("Upload IEP is offered on the list", async () => {
    const { user, onUploadIep } = renderGoals();
    await user.click(await screen.findByRole("button", { name: "Upload IEP" }));
    expect(onUploadIep).toHaveBeenCalledOnce();
  });
});

describe("<Goals /> detail", () => {
  test("shows discipline, title, tags and recent entries newest-first with readable labels", async () => {
    const { user } = renderGoals();
    await user.click(await screen.findByRole("button", { name: /Requests help/ }));
    expect(screen.getByRole("heading", { name: "Requests help" })).toBeInTheDocument();
    expect(screen.getByText("Speech therapy")).toBeInTheDocument();
    expect(screen.getByText("From your IEP upload")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload IEP" })).not.toBeInTheDocument();

    const entries = screen.getAllByRole("listitem");
    expect(entries.map((li) => li.textContent)).toEqual([
      `Taps shoulder${shortDate(d(9))}Did it independentlyLogged by you at home`,
      `Says help${shortDate(d(3))}Needed a little help${CENTRE_A.name}`,
      "General practice—MYSTERYLogged by you at home"
    ]);
  });

  test("care-team provenance label in detail", async () => {
    const { user } = renderGoals();
    await user.click(await screen.findByRole("button", { name: /Climbs stairs/ }));
    expect(screen.getByText("Added by your care team")).toBeInTheDocument();
    expect(screen.getByText("Physiotherapy")).toBeInTheDocument();
  });

  test("caps recent entries at 10", async () => {
    mockApi.listGoals.mockResolvedValue([makeGoal({ title: "Busy", items: [makeItem({ evidence: Array.from({ length: 12 }, (_, i) => makeEvidence({ logDate: d(i + 1) })) })] })]);
    const { user } = renderGoals();
    await user.click(await screen.findByRole("button", { name: /Busy/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  test("no evidence -> 'Nothing logged yet.'", async () => {
    mockApi.listGoals.mockResolvedValue([makeGoal({ title: "Fresh" })]);
    const { user } = renderGoals();
    await user.click(await screen.findByRole("button", { name: /Fresh/ }));
    expect(screen.getByText("Nothing logged yet.")).toBeInTheDocument();
  });

  test("← All goals and the header Back both return to the list", async () => {
    const { user } = renderGoals();
    await user.click(await screen.findByRole("button", { name: /Requests help/ }));
    await user.click(screen.getByRole("button", { name: "← All goals" }));
    expect(screen.getByRole("button", { name: "Upload IEP" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Requests help/ }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Upload IEP" })).toBeInTheDocument();
  });

  test("Log something opens the form; Cancel closes it; saving refetches and closes it", async () => {
    const { user } = renderGoals();
    await user.click(await screen.findByRole("button", { name: /Requests help/ }));
    await user.click(screen.getByRole("button", { name: "Log something for this goal" }));
    expect(screen.getByText("What specifically happened?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("What specifically happened?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log something for this goal" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mockApi.logEvidence).toHaveBeenCalledWith("tok", "kid-1", "goal-iep", expect.any(Object));
    expect(await screen.findByRole("button", { name: "Log something for this goal" })).toBeInTheDocument();
    expect(mockApi.listGoals).toHaveBeenCalledTimes(2);
    // still on the same goal's detail
    expect(screen.getByRole("heading", { name: "Requests help" })).toBeInTheDocument();
  });
});
