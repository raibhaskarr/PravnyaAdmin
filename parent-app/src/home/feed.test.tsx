import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { buildActivityCandidates } from "../activities/Activities";
import { buildGrowthGoals, buildGrowthMoments } from "../growth/Growth";
import { CENTRE_A, goalWithEvidence, makeEvidence, makeGoal, makeItem } from "../test/fixtures";
import { buildFeed, FeedCard, type FeedItem } from "./feed";

const d = (day: number) => `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`;

describe("buildFeed", () => {
  test("no goals -> empty feed", () => {
    expect(buildFeed([])).toEqual([]);
  });

  test("goals without evidence -> empty feed", () => {
    expect(buildFeed([makeGoal(), makeGoal({ items: [makeItem()] })])).toEqual([]);
  });

  test("headline growth goal prefers an up-trending goal over one with more evidence", () => {
    const steady = goalWithEvidence([{ outcome: "CORRECT" }, { outcome: "CORRECT" }, { outcome: "CORRECT" }, { outcome: "CORRECT" }, { outcome: "CORRECT" }].map((e, i) => ({ ...e, logDate: d(i + 1) })), { title: "Steady" });
    const up = goalWithEvidence(["INCORRECT", "INCORRECT", "CORRECT", "CORRECT"].map((outcome, i) => ({ outcome, logDate: d(i + 1) })), { title: "Up" });
    const feed = buildFeed([steady, up]);
    expect(feed[0]).toMatchObject({ kind: "growth", goal: { goalTitle: "Up" } });
    expect(feed.filter((i) => i.kind === "growth")).toHaveLength(1);
  });

  test("with nothing trending up, the most-evidenced goal is the headline", () => {
    const a = goalWithEvidence([{ outcome: "PARTIAL" }], { title: "A" });
    const b = goalWithEvidence([{ outcome: "PARTIAL" }, { outcome: "PARTIAL" }], { title: "B" });
    expect(buildFeed([a, b])[0]).toMatchObject({ kind: "growth", goal: { goalTitle: "B" } });
  });

  test("order is growth, then up to 2 activities, then up to 2 moments -- each straight from the tab helpers", () => {
    // Four goals, each centre-only with one CORRECT -> 4 activity candidates + 4 moments.
    const goals = [1, 2, 3, 4].map((n) =>
      makeGoal({ title: `G${n}`, items: [makeItem({ evidence: Array.from({ length: n }, (_, i) => makeEvidence({ centre: CENTRE_A, outcome: "CORRECT", logDate: d(n * 2 + i) })) })] })
    );
    const feed = buildFeed(goals);
    expect(feed.map((i) => i.kind)).toEqual(["growth", "activity", "activity", "moment", "moment"]);
    expect(feed.slice(1, 3)).toEqual(buildActivityCandidates(goals).slice(0, 2).map((candidate) => ({ kind: "activity", candidate })));
    expect(feed.slice(3)).toEqual(buildGrowthMoments(goals, 2).map((moment) => ({ kind: "moment", moment })));
    expect(feed[0]).toEqual({ kind: "growth", goal: buildGrowthGoals(goals)[0] });
  });
});

describe("<FeedCard />", () => {
  const goal = goalWithEvidence([{ outcome: "CORRECT", centre: CENTRE_A, logDate: "2026-10-15T12:00:00.000Z" }], { title: "Waves hello" }, { customText: "Waves" });

  function renderCard(item: FeedItem) {
    const onNavigate = vi.fn();
    render(<FeedCard item={item} kidName="Sam" onNavigate={onNavigate} />);
    return onNavigate;
  }

  test("growth item: eyebrow + phrase with singular count, navigates to Growth", async () => {
    const onNavigate = renderCard({ kind: "growth", goal: buildGrowthGoals([goal])[0] });
    expect(screen.getByText("Growth highlight")).toBeInTheDocument();
    expect(screen.getByText('Sam is just starting to show up on "Waves hello" — 1 moment logged.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(onNavigate).toHaveBeenCalledWith("growth");
  });

  test("growth item: plural count", () => {
    const two = goalWithEvidence([{}, {}], { title: "Two" });
    renderCard({ kind: "growth", goal: buildGrowthGoals([two])[0] });
    expect(screen.getByText(/2 moments logged\./)).toBeInTheDocument();
  });

  test("activity item: centre, date and item, navigates to Activities", async () => {
    const onNavigate = renderCard({ kind: "activity", candidate: buildActivityCandidates([goal])[0] });
    expect(screen.getByText("Try this at home")).toBeInTheDocument();
    const expectedDate = new Date("2026-10-15T12:00:00.000Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });
    expect(screen.getByRole("button")).toHaveTextContent(`Confirmed at ${CENTRE_A.name} on ${expectedDate} — try "Waves" at home and log what happens.`);
    await userEvent.click(screen.getByRole("button"));
    expect(onNavigate).toHaveBeenCalledWith("activities");
  });

  test("activity item without a date omits the 'on <date>' clause", () => {
    const undated = goalWithEvidence([{ centre: CENTRE_A, logDate: null }]);
    renderCard({ kind: "activity", candidate: buildActivityCandidates([undated])[0] });
    expect(screen.getByRole("button")).toHaveTextContent(`Confirmed at ${CENTRE_A.name} — try`);
  });

  test("moment item: milestone eyebrow + goal title and moment, navigates to Growth", async () => {
    const onNavigate = renderCard({ kind: "moment", moment: buildGrowthMoments([goal])[0] });
    expect(screen.getByText("Milestone")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent('Waves hello — Got "Waves" right for the first time');
    await userEvent.click(screen.getByRole("button"));
    expect(onNavigate).toHaveBeenCalledWith("growth");
  });
});
