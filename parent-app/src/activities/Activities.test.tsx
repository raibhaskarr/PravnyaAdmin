import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../api/client";
import { CENTRE_A, CENTRE_B, makeEvidence, makeGoal, makeItem } from "../test/fixtures";
import { Activities, buildActivityCandidates } from "./Activities";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const d = (day: number) => `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`;
const atCentre = (day: number | null, centre = CENTRE_A) => makeEvidence({ centre, logDate: day === null ? null : d(day) });
const atHome = (day: number) => makeEvidence({ centre: null, logDate: d(day) });

describe("buildActivityCandidates", () => {
  test("no goals / no evidence -> nothing", () => {
    expect(buildActivityCandidates([])).toEqual([]);
    expect(buildActivityCandidates([makeGoal({ items: [makeItem()] })])).toEqual([]);
  });

  test("home-only evidence -> nothing to confirm", () => {
    expect(buildActivityCandidates([makeGoal({ items: [makeItem({ evidence: [atHome(1), atHome(2)] })] })])).toEqual([]);
  });

  test("home already matches centre -> not a candidate (tie excluded)", () => {
    expect(buildActivityCandidates([makeGoal({ items: [makeItem({ evidence: [atCentre(1), atHome(2)] })] })])).toEqual([]);
  });

  test("centre ahead of home -> candidate with counts, gap and the latest centre confirmation", () => {
    const goal = makeGoal({ items: [makeItem({ customText: "Stacks cups", evidence: [atCentre(3, CENTRE_B), atCentre(9, CENTRE_A), atHome(5)] })] });
    expect(buildActivityCandidates([goal])).toEqual([
      {
        goal,
        centreEvidenceCount: 2,
        homeEvidenceCount: 1,
        gap: 1,
        suggestedItemLabel: "Stacks cups",
        suggestedCentreName: CENTRE_A.name,
        suggestedDate: d(9)
      }
    ]);
  });

  test("label falls back to the canonical item name, then 'General practice'", () => {
    const canonical = makeGoal({ items: [makeItem({ canonicalSkillItem: { id: "c", displayName: "Points to pictures" }, evidence: [atCentre(1)] })] });
    const bare = makeGoal({ items: [makeItem({ evidence: [atCentre(1)] })] });
    expect(buildActivityCandidates([canonical])[0].suggestedItemLabel).toBe("Points to pictures");
    expect(buildActivityCandidates([bare])[0].suggestedItemLabel).toBe("General practice");
  });

  test("suggested item: the one with the fewest home tries wins", () => {
    const goal = makeGoal({
      items: [
        makeItem({ customText: "Already tried at home", evidence: [atCentre(10), atCentre(11), atHome(12)] }),
        makeItem({ customText: "Never tried at home", evidence: [atCentre(1)] })
      ]
    });
    expect(buildActivityCandidates([goal])[0].suggestedItemLabel).toBe("Never tried at home");
  });

  test("suggested item: tie on home tries -> the more recently confirmed one wins", () => {
    const goal = makeGoal({
      items: [makeItem({ customText: "Older", evidence: [atCentre(2)] }), makeItem({ customText: "Newer", evidence: [atCentre(8)] }), makeItem({ customText: "Middle", evidence: [atCentre(5)] })]
    });
    expect(buildActivityCandidates([goal])[0]).toMatchObject({ suggestedItemLabel: "Newer", suggestedDate: d(8) });
  });

  test("items where home already caught up are never suggested even if the goal overall qualifies", () => {
    const goal = makeGoal({
      items: [makeItem({ customText: "Caught up", evidence: [atCentre(20), atHome(21)] }), makeItem({ customText: "Behind", evidence: [atCentre(1), atCentre(2)] })]
    });
    expect(buildActivityCandidates([goal])[0].suggestedItemLabel).toBe("Behind");
  });

  test("undated centre evidence -> suggestedDate is null", () => {
    const goal = makeGoal({ items: [makeItem({ evidence: [atCentre(null)] })] });
    expect(buildActivityCandidates([goal])[0].suggestedDate).toBeNull();
  });

  test("sorted by biggest gap first, then most recent confirmation (undated last)", () => {
    const g = (title: string, evidence: ReturnType<typeof makeEvidence>[]) => makeGoal({ title, items: [makeItem({ evidence })] });
    const result = buildActivityCandidates([
      g("gap1-old", [atCentre(1)]),
      g("gap2", [atCentre(3), atCentre(4)]),
      g("gap1-undated", [atCentre(null)]),
      g("gap1-new", [atCentre(7)])
    ]);
    expect(result.map((c) => c.goal.title)).toEqual(["gap2", "gap1-new", "gap1-old", "gap1-undated"]);
  });
});

describe("<Activities />", () => {
  const candidateGoal = () =>
    makeGoal({
      id: "goal-act",
      title: "Asks for help using words",
      domainName: "Communication",
      items: [makeItem({ id: "item-1", customText: "Help please", evidence: [atCentre(3), atCentre(4)] })]
    });

  beforeEach(() => {
    mockApi.listGoals.mockResolvedValue([candidateGoal()]);
    mockApi.logEvidence.mockResolvedValue({} as never);
  });

  test("lists candidates with the centre/home tally and suggestion copy", async () => {
    render(<Activities token="tok" kidId="kid-1" />);
    expect(await screen.findByText("1 goal waiting on a home try")).toBeInTheDocument();
    expect(mockApi.listGoals).toHaveBeenCalledWith("tok", "kid-1");
    expect(screen.getByText("Communication · Speech therapy")).toBeInTheDocument();
    expect(screen.getByText("Centre 2 · Home 0")).toBeInTheDocument();
    const card = screen.getByRole("button", { name: /Asks for help using words/ });
    expect(card).toHaveTextContent(`Confirmed at ${CENTRE_A.name} on`);
    expect(card).toHaveTextContent('try "Help please" at home');
  });

  test("plural count and no date clause when the confirmation is undated", async () => {
    mockApi.listGoals.mockResolvedValue([
      makeGoal({ title: "A", items: [makeItem({ evidence: [atCentre(null)] })] }),
      makeGoal({ title: "B", items: [makeItem({ evidence: [atCentre(2)] })] })
    ]);
    render(<Activities token="tok" kidId="kid-1" />);
    expect(await screen.findByText("2 goals waiting on a home try")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Speech therapy A / })).toHaveTextContent(`Confirmed at ${CENTRE_A.name} — try`);
  });

  test("empty state when nothing needs a home try", async () => {
    mockApi.listGoals.mockResolvedValue([]);
    render(<Activities token="tok" kidId="kid-1" />);
    expect(await screen.findByText(/Nothing waiting on a home try right now/)).toBeInTheDocument();
  });

  test("API error message vs generic fallback", async () => {
    mockApi.listGoals.mockRejectedValueOnce(new ApiError(500, "Server is sad"));
    const { unmount } = render(<Activities token="tok" kidId="kid-1" />);
    expect(await screen.findByText("Server is sad")).toBeInTheDocument();
    unmount();

    mockApi.listGoals.mockRejectedValueOnce(new Error("boom"));
    render(<Activities token="tok" kidId="kid-1" />);
    expect(await screen.findByText("Couldn't load activities. Try again.")).toBeInTheDocument();
  });

  test("tapping a card opens the log form; Back (header) or Cancel return to the list", async () => {
    const user = userEvent.setup();
    render(<Activities token="tok" kidId="kid-1" />);
    await user.click(await screen.findByRole("button", { name: /Asks for help using words/ }));
    expect(screen.getByText("What specifically happened?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("1 goal waiting on a home try")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Asks for help using words/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("1 goal waiting on a home try")).toBeInTheDocument();
  });

  test("logging from a card saves against that goal, then refetches and returns to the list", async () => {
    const user = userEvent.setup();
    render(<Activities token="tok" kidId="kid-1" />);
    await user.click(await screen.findByRole("button", { name: /Asks for help using words/ }));
    // After logging, home has caught up -> the list is empty on refetch.
    mockApi.listGoals.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockApi.logEvidence).toHaveBeenCalledWith("tok", "kid-1", "goal-act", expect.objectContaining({ outcome: "CORRECT" }));
    expect(await screen.findByText(/Nothing waiting on a home try right now/)).toBeInTheDocument();
    expect(mockApi.listGoals).toHaveBeenCalledTimes(2);
  });
});
