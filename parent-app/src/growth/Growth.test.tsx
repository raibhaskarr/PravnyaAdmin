import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type GoalItemEvidence } from "../api/client";
import { CENTRE_A, CENTRE_B, goalWithEvidence, makeEvidence, makeGoal, makeItem } from "../test/fixtures";
import { buildGrowthGoals, buildGrowthMoments, Growth } from "./Growth";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

// Day N of October 2026 -- keeps chronological fixtures readable.
const d = (day: number) => `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`;
const series = (outcomes: string[], extra: Partial<GoalItemEvidence> = {}) => outcomes.map((outcome, i) => ({ outcome, logDate: d(i + 1), ...extra }));

describe("buildGrowthGoals -- trend + status phrase", () => {
  test("goals with no evidence at all are left out", () => {
    expect(buildGrowthGoals([makeGoal(), makeGoal({ items: [makeItem()] })])).toEqual([]);
  });

  const trendCases: { name: string; outcomes: string[]; trend: string; phrase: string }[] = [
    { name: "1 entry -> emerging", outcomes: ["CORRECT"], trend: "emerging", phrase: "Just starting to show up" },
    { name: "2 entries -> still emerging even if improving", outcomes: ["INCORRECT", "CORRECT"], trend: "emerging", phrase: "Just starting to show up" },
    { name: "clear improvement -> up", outcomes: ["INCORRECT", "INCORRECT", "CORRECT", "CORRECT"], trend: "up", phrase: "Getting more independent" },
    { name: "consistently independent -> steady/well", outcomes: ["CORRECT", "CORRECT", "CORRECT", "CORRECT"], trend: "steady", phrase: "Steady — doing this well" },
    { name: "consistently struggling -> still building", outcomes: ["INCORRECT", "ATTEMPTED", "INCORRECT"], trend: "steady", phrase: "Still building this" },
    { name: "getting worse -> steady, not up", outcomes: ["CORRECT", "CORRECT", "INCORRECT", "INCORRECT"], trend: "steady", phrase: "Still building this" },
    // Odd count: half = floor(3/2) = 1, so only the first vs the last entry are compared.
    { name: "odd count compares first vs last only", outcomes: ["ATTEMPTED", "INCORRECT", "CORRECT"], trend: "up", phrase: "Getting more independent" },
    // 10 entries: early avg 1.0, recent avg 1.6 -> exactly +0.6 counts as up.
    { name: "+0.6 boundary counts as up", outcomes: [...Array(5).fill("INCORRECT"), "ATTEMPTED", "ATTEMPTED", "ATTEMPTED", "INCORRECT", "INCORRECT"], trend: "up", phrase: "Getting more independent" },
    // early 1.0, recent 1.4 -> +0.4 is not enough.
    { name: "+0.4 is not up", outcomes: [...Array(5).fill("INCORRECT"), "ATTEMPTED", "ATTEMPTED", "INCORRECT", "INCORRECT", "INCORRECT"], trend: "steady", phrase: "Still building this" },
    // recent avg 3.4 (>= 3.3) with no big jump -> doing well; 3.2 -> still building.
    { name: "recent avg 3.4 -> doing well", outcomes: ["PARTIAL", "PARTIAL", "PARTIAL", "PARTIAL", "PARTIAL", "CORRECT", "CORRECT", "PARTIAL", "PARTIAL", "PARTIAL"], trend: "steady", phrase: "Steady — doing this well" },
    { name: "recent avg 3.2 -> still building", outcomes: ["PARTIAL", "PARTIAL", "PARTIAL", "PARTIAL", "PARTIAL", "CORRECT", "PARTIAL", "PARTIAL", "PARTIAL", "PARTIAL"], trend: "steady", phrase: "Still building this" },
    // Unknown outcome strings map to the lowest level rather than crashing.
    { name: "unknown outcomes count as level 1", outcomes: ["MYSTERY", "MYSTERY", "CORRECT", "CORRECT"], trend: "up", phrase: "Getting more independent" }
  ];
  for (const c of trendCases) {
    test(c.name, () => {
      const [view] = buildGrowthGoals([goalWithEvidence(series(c.outcomes))]);
      expect(view.trend).toBe(c.trend);
      expect(view.statusPhrase).toBe(c.phrase);
      expect(view.evidenceCount).toBe(c.outcomes.length);
    });
  }

  test("evidence is ordered chronologically across items (undated first) before computing the trend", () => {
    // Item A holds the two late successes, item B the two early misses -- item order mustn't matter.
    const goal = makeGoal({
      items: [
        makeItem({ customText: "A", evidence: [makeEvidence({ outcome: "CORRECT", logDate: d(20) }), makeEvidence({ outcome: "CORRECT", logDate: d(10) })] }),
        makeItem({ customText: "B", evidence: [makeEvidence({ outcome: "INCORRECT", logDate: d(2) }), makeEvidence({ outcome: "INCORRECT", logDate: null })] })
      ]
    });
    const [view] = buildGrowthGoals([goal]);
    expect(view.trend).toBe("up");
    expect(view.glyphLevels).toEqual([1, 1, 4, 4]);
  });

  test("glyph shows only the 5 most recent levels, oldest first", () => {
    const [view] = buildGrowthGoals([goalWithEvidence(series(["CORRECT", "INCORRECT", "ATTEMPTED", "PARTIAL", "NOT_OBSERVED", "UNKNOWN", "CORRECT"]))]);
    expect(view.glyphLevels).toEqual([2, 3, 1, 1, 4]);
  });

  test("copies goal/skill/domain identity onto the view", () => {
    const goal = goalWithEvidence([{}], { title: "Uses a spoon", domainName: "Daily living", skillName: "Self-feeding" });
    expect(buildGrowthGoals([goal])[0]).toMatchObject({ goalId: goal.id, goalTitle: "Uses a spoon", domainName: "Daily living", skillName: "Self-feeding", goal });
  });

  test("environments: Home for no centre, deduped by centre id (not name), in first-seen order", () => {
    const sameNameDifferentCentre = { id: "centre-c", name: CENTRE_A.name, city: null };
    const goal = goalWithEvidence([
      { centre: CENTRE_A, logDate: d(1) },
      { centre: null, logDate: d(2) },
      { centre: CENTRE_A, logDate: d(3) },
      { centre: sameNameDifferentCentre, logDate: d(4) },
      { centre: null, logDate: d(5) }
    ]);
    expect(buildGrowthGoals([goal])[0].environments).toEqual([CENTRE_A.name, "Home", CENTRE_A.name]);
  });

  // BUG: the code comment says "first-seen display label wins", but Map#set on an existing key
  // overwrites the value, so the LAST label seen for a centre id is displayed. Only matters if the
  // same centre id comes back with different names (e.g. a centre renamed after older evidence).
  test.fails("BUG: environments use the first-seen label for a centre id", () => {
    const goal = goalWithEvidence([
      { centre: CENTRE_A, logDate: d(1) },
      { centre: { ...CENTRE_A, name: "Sunny Steps (renamed)" }, logDate: d(2) }
    ]);
    expect(buildGrowthGoals([goal])[0].environments).toEqual([CENTRE_A.name]);
  });

  test("recentItems: newest first, case-insensitive dedupe, skips items with no evidence, max 4, label fallbacks", () => {
    const item = (label: Partial<{ customText: string; display: string }>, latest: string | null) =>
      makeItem({
        customText: label.customText ?? null,
        canonicalSkillItem: label.display ? { id: `csi-${label.display}`, displayName: label.display } : null,
        evidence: latest === null ? [] : [makeEvidence({ logDate: latest })]
      });
    const goal = makeGoal({
      items: [
        item({ customText: "Water" }, d(1)),
        item({ display: "Juice" }, d(9)),
        item({ customText: "juice" }, d(8)), // dup of Juice, older -> dropped
        item({}, d(7)), // "General practice"
        item({ customText: "Never practiced" }, null),
        item({ customText: "Milk" }, d(5)),
        item({ customText: "Snack" }, d(3))
      ]
    });
    expect(buildGrowthGoals([goal])[0].recentItems).toEqual(["Juice", "General practice", "Milk", "Snack"]);
  });

  test("customText wins over the canonical item name", () => {
    const goal = makeGoal({ items: [makeItem({ customText: "Own words", canonicalSkillItem: { id: "c", displayName: "Canonical" }, evidence: [makeEvidence()] })] });
    expect(buildGrowthGoals([goal])[0].recentItems).toEqual(["Own words"]);
  });

  test("an item whose newest evidence is undated isn't listed as recent", () => {
    const goal = makeGoal({ items: [makeItem({ customText: "Undated", evidence: [makeEvidence({ logDate: null })] })] });
    expect(buildGrowthGoals([goal])[0].recentItems).toEqual([]);
  });

  test("views are sorted by evidence count, most first", () => {
    const small = goalWithEvidence([{}], { title: "small" });
    const big = goalWithEvidence([{}, {}, {}], { title: "big" });
    const mid = goalWithEvidence([{}, {}], { title: "mid" });
    expect(buildGrowthGoals([small, big, mid]).map((v) => v.goalTitle)).toEqual(["big", "mid", "small"]);
  });
});

describe("buildGrowthMoments", () => {
  test("no goals / no dated evidence -> no moments", () => {
    expect(buildGrowthMoments([])).toEqual([]);
    expect(buildGrowthMoments([goalWithEvidence([{ logDate: null, outcome: "CORRECT" }])])).toEqual([]);
  });

  test("first CORRECT is a moment, named after the item when there is one", () => {
    const goal = goalWithEvidence(
      [
        { outcome: "INCORRECT", logDate: d(1) },
        { outcome: "CORRECT", logDate: d(2) },
        { outcome: "CORRECT", logDate: d(3) }
      ],
      { title: "Requests snacks" },
      { customText: "Crackers" }
    );
    expect(buildGrowthMoments([goal])).toEqual([{ date: d(2), goalTitle: "Requests snacks", title: 'Got "Crackers" right for the first time', environment: "Home" }]);
  });

  test("canonical item name is used when there's no custom text", () => {
    const goal = goalWithEvidence([{ outcome: "CORRECT" }], {}, { canonicalSkillItem: { id: "c", displayName: "Waves bye" } });
    expect(buildGrowthMoments([goal])[0].title).toBe('Got "Waves bye" right for the first time');
  });

  test("an unnamed item gets the generic first-success title", () => {
    expect(buildGrowthMoments([goalWithEvidence([{ outcome: "CORRECT", centre: CENTRE_A }])])[0]).toMatchObject({
      title: "First independent success",
      environment: CENTRE_A.name
    });
  });

  test("first appearance in a new setting (after the first one) is a moment; returning to a known one isn't", () => {
    const goal = goalWithEvidence([
      { outcome: "PARTIAL", centre: CENTRE_A, logDate: d(1) }, // first ever setting -> not a moment
      { outcome: "PARTIAL", centre: null, logDate: d(2) }, // new: Home
      { outcome: "PARTIAL", centre: CENTRE_A, logDate: d(3) }, // seen
      { outcome: "PARTIAL", centre: CENTRE_B, logDate: d(4) } // new
    ]);
    expect(buildGrowthMoments([goal]).map((m) => m.title)).toEqual(["First time this showed up at Little Leaps Centre", "First time this showed up at Home"]);
  });

  test("a first CORRECT in a new setting yields only the success moment, not both", () => {
    const goal = goalWithEvidence([
      { outcome: "PARTIAL", centre: CENTRE_A, logDate: d(1) },
      { outcome: "CORRECT", centre: null, logDate: d(2) }
    ]);
    expect(buildGrowthMoments([goal]).map((m) => m.title)).toEqual(["First independent success"]);
  });

  test("undated evidence is ignored entirely (doesn't even count as seeing a setting)", () => {
    const goal = goalWithEvidence([
      { outcome: "PARTIAL", centre: CENTRE_A, logDate: null },
      { outcome: "PARTIAL", centre: null, logDate: d(2) }
    ]);
    expect(buildGrowthMoments([goal])).toEqual([]);
  });

  test("moments from all goals are merged newest-first and capped by limit (default 10)", () => {
    const goals = Array.from({ length: 12 }, (_, i) => goalWithEvidence([{ outcome: "CORRECT", logDate: d(i + 1) }], { title: `G${i + 1}` }));
    const all = buildGrowthMoments(goals);
    expect(all).toHaveLength(10);
    expect(all[0].goalTitle).toBe("G12");
    expect(all.at(-1)!.goalTitle).toBe("G3");
    expect(buildGrowthMoments(goals, 2).map((m) => m.goalTitle)).toEqual(["G12", "G11"]);
  });
});

describe("<Growth />", () => {
  beforeEach(() => {
    mockApi.listGoals.mockResolvedValue([]);
  });

  function renderGrowth() {
    return render(<Growth token="tok" kidId="kid-1" kidName="Sam" />);
  }

  test("fetches goals for the kid and shows the empty state", async () => {
    renderGrowth();
    expect(await screen.findByText("No practice history logged for Sam yet.")).toBeInTheDocument();
    expect(mockApi.listGoals).toHaveBeenCalledWith("tok", "kid-1");
  });

  test("shows the server's error message", async () => {
    mockApi.listGoals.mockRejectedValue(new ApiError(403, "Not your kid"));
    renderGrowth();
    expect(await screen.findByText("Not your kid")).toBeInTheDocument();
  });

  test("shows a generic error on a non-API failure", async () => {
    mockApi.listGoals.mockRejectedValue(new TypeError("network"));
    renderGrowth();
    expect(await screen.findByText("Couldn't load growth. Try again.")).toBeInTheDocument();
  });

  const upGoal = () =>
    goalWithEvidence(
      [
        { outcome: "INCORRECT", logDate: d(1), centre: CENTRE_A },
        { outcome: "INCORRECT", logDate: d(2), centre: CENTRE_A },
        { outcome: "CORRECT", logDate: d(3), centre: null },
        { outcome: "CORRECT", logDate: d(4), centre: null }
      ],
      { title: "Asks for help", domainName: "Communication" },
      { customText: "Help please" }
    );
  const steadyGoal = () =>
    goalWithEvidence(
      [
        { outcome: "CORRECT", logDate: d(1) },
        { outcome: "CORRECT", logDate: d(2) },
        { outcome: "CORRECT", logDate: d(3) },
        { outcome: "CORRECT", logDate: d(4) },
        { outcome: "CORRECT", logDate: d(5) }
      ],
      { title: "Puts on shoes", domainName: "Daily living" }
    );

  test("hero highlights the up-trending goal even if another has more evidence; stat tiles count correctly", async () => {
    mockApi.listGoals.mockResolvedValue([steadyGoal(), upGoal()]);
    renderGrowth();
    expect(await screen.findByText('Sam is getting more independent on "Asks for help" — 4 moments logged.')).toBeInTheDocument();
    const tile = (label: string) => screen.getByText(label).previousElementSibling!;
    expect(tile("Getting stronger")).toHaveTextContent("1");
    expect(tile("Showing up at home too")).toHaveTextContent("1");
    expect(tile("Goals with evidence")).toHaveTextContent("2");
    // Domains are grouped, biggest first.
    expect(screen.getByText("Daily living", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Communication", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Help please")).toBeInTheDocument(); // "Recently:" items
  });

  test("hero falls back to the most-evidenced goal when nothing is trending up", async () => {
    mockApi.listGoals.mockResolvedValue([steadyGoal()]);
    renderGrowth();
    expect(await screen.findByText('Sam is steady — doing this well on "Puts on shoes" — 5 moments logged.')).toBeInTheDocument();
  });

  test("Simple hides per-goal evidence detail; Detailed shows it plus the cross-setting banner", async () => {
    const user = userEvent.setup();
    mockApi.listGoals.mockResolvedValue([upGoal(), steadyGoal()]);
    renderGrowth();
    await screen.findByText("Growth highlight");

    expect(screen.queryByText("Consistent across settings")).not.toBeInTheDocument();
    expect(screen.queryByText(/4 moments ·/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Detailed" }));
    expect(screen.getByText("Consistent across settings")).toBeInTheDocument();
    expect(screen.getByText("1 goal now show up in more than one setting, not just one place.")).toBeInTheDocument();
    expect(screen.getByText("Sunny Steps Clinic & Home")).toBeInTheDocument();
    expect(screen.getByText("Home only so far")).toBeInTheDocument();
    expect(screen.getByText(/5 moments ·/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simple" }));
    expect(screen.queryByText("Consistent across settings")).not.toBeInTheDocument();
  });

  test("Detailed: single-entry goal says '1 moment', single centre says '<centre> only so far', no banner without cross-setting goals", async () => {
    const user = userEvent.setup();
    mockApi.listGoals.mockResolvedValue([goalWithEvidence([{ centre: CENTRE_B }], { title: "One-off" })]);
    renderGrowth();
    await user.click(await screen.findByRole("button", { name: "Detailed" }));
    expect(screen.getByText(/^1 moment ·/)).toBeInTheDocument();
    expect(screen.getByText("Little Leaps Centre only so far")).toBeInTheDocument();
    expect(screen.queryByText("Consistent across settings")).not.toBeInTheDocument();
  });

  test("glyph legend toggles its explanation", async () => {
    const user = userEvent.setup();
    mockApi.listGoals.mockResolvedValue([steadyGoal()]);
    renderGrowth();
    const toggle = await screen.findByRole("button", { name: /What do the colored bars mean/ });
    expect(screen.queryByText(/Each bar is one of the most recent tries/)).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByText(/Each bar is one of the most recent tries/)).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByText(/Each bar is one of the most recent tries/)).not.toBeInTheDocument();
  });

  test("journey teaser shows the 2 newest moments and the total count", async () => {
    mockApi.listGoals.mockResolvedValue([upGoal(), steadyGoal()]);
    renderGrowth();
    expect(await screen.findByText("Sam's journey")).toBeInTheDocument();
    // upGoal: first CORRECT (d3, Home). steadyGoal: first CORRECT (d1, Home).
    expect(screen.getByText("2 moments found")).toBeInTheDocument();
    expect(screen.getByText('Asks for help — Got "Help please" right for the first time')).toBeInTheDocument();
    expect(screen.getByText("Puts on shoes — First independent success")).toBeInTheDocument();
  });

  test("no journey teaser when there are no moments", async () => {
    mockApi.listGoals.mockResolvedValue([goalWithEvidence([{ outcome: "PARTIAL" }])]);
    renderGrowth();
    await screen.findByText("Growth highlight");
    expect(screen.queryByText("Sam's journey")).not.toBeInTheDocument();
  });

  describe("goal detail", () => {
    const measured = (m: Partial<GoalItemEvidence>) => makeEvidence({ logDate: d(5), ...m });
    const detailGoal = () =>
      makeGoal({
        title: "Counts objects",
        domainName: "Cognition",
        skillName: "Counting to 10",
        items: [
          makeItem({
            customText: "Blocks",
            evidence: [
              measured({ id: "e-freq", measurementType: "FREQUENCY", measurementValue: 3, measurementUnit: "blocks", outcome: "CORRECT", modality: "MANUAL_SIGN", centre: CENTRE_A }),
              measured({ id: "e-freq-default", measurementType: "FREQUENCY", measurementValue: 2, measurementUnit: null, outcome: "PARTIAL" }),
              measured({ id: "e-dur-sec", measurementType: "DURATION", measurementValue: 45 }),
              measured({ id: "e-dur-min", measurementType: "DURATION", measurementValue: 120 }),
              measured({ id: "e-dur-both", measurementType: "DURATION", measurementValue: 95 }),
              measured({ id: "e-pct", measurementType: "PERCENTAGE", measurementValue: 66.6 }),
              measured({ id: "e-rating", measurementType: "RATING", measurementValue: 4 }),
              measured({ id: "e-yes", measurementType: "YES_NO", measurementBoolean: true }),
              measured({ id: "e-no", measurementType: "YES_NO", measurementBoolean: false }),
              measured({ id: "e-yn-null", measurementType: "YES_NO", measurementBoolean: null, outcome: "NOT_OBSERVED", modality: "NOT_APPLICABLE" }),
              measured({ id: "e-obs", measurementType: "FREE_OBSERVATION", measurementText: "Counted to 7 unprompted" }),
              measured({ id: "e-obs-null", measurementType: "FREE_OBSERVATION", measurementText: null, outcome: "UNKNOWN" }),
              measured({ id: "e-freq-null", measurementType: "FREQUENCY", measurementValue: null, outcome: "WEIRD_OUTCOME", logDate: null }),
              measured({ id: "e-unknown-type", measurementType: "SOMETHING_NEW", measurementValue: 9, outcome: "ATTEMPTED" })
            ]
          }),
          makeItem({ customText: "Untouched item", evidence: [] })
        ]
      });

    async function openDetail() {
      const user = userEvent.setup();
      mockApi.listGoals.mockResolvedValue([detailGoal()]);
      renderGrowth();
      await user.click(await screen.findByRole("button", { name: /Counts objects/ }));
      return user;
    }

    test("shows domain, title, skill and how many items were practiced (items without evidence excluded)", async () => {
      await openDetail();
      expect(screen.getByRole("heading", { name: "Counts objects" })).toBeInTheDocument();
      expect(screen.getByText("Cognition")).toBeInTheDocument();
      expect(screen.getByText("Counting to 10")).toBeInTheDocument();
      expect(screen.getByText("Sam has practiced 1 thing for this")).toBeInTheDocument();
      expect(screen.queryByText("Untouched item")).not.toBeInTheDocument();
      expect(screen.getByText("14×")).toBeInTheDocument();
    });

    test("expanding an item lists each entry with readable measurement/outcome/modality/setting labels", async () => {
      const user = await openDetail();
      const itemToggle = screen.getByRole("button", { name: /Blocks/ });
      expect(itemToggle).toHaveTextContent("▸");
      await user.click(itemToggle);
      expect(itemToggle).toHaveTextContent("▾");

      for (const text of [
        "3 blocks",
        "2 times",
        "45 sec",
        "2 min",
        "1 min 35 sec",
        "67%",
        "Rated 4/5",
        "Yes",
        "Not yet",
        "Counted to 7 unprompted",
        "Signed it",
        "Did it on their own",
        "Needed a little help",
        "Didn't get a chance to try",
        "Logged, outcome unclear",
        "WEIRD_OUTCOME",
        "Gave it a try", // unknown measurement type -> falls back to the outcome label
        "—"
      ]) {
        expect(screen.getAllByText(text).length, text).toBeGreaterThan(0);
      }
      // Setting tags: one centre entry, the rest Home.
      expect(screen.getAllByText(CENTRE_A.name)).toHaveLength(1);
      expect(screen.getAllByText("Home")).toHaveLength(13);
      expect(screen.queryByText(/^9/)).not.toBeInTheDocument();
      // NOT_APPLICABLE modality has no friendly label -> no modality line.
      expect(screen.queryByText("NOT_APPLICABLE")).not.toBeInTheDocument();

      await user.click(itemToggle);
      expect(screen.queryByText("Rated 4/5")).not.toBeInTheDocument();
    });

    test("both the in-page and header Back return to the overview", async () => {
      const user = await openDetail();
      await user.click(screen.getByRole("button", { name: "← Back" }));
      expect(screen.getByText("Growth highlight")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Counts objects/ }));
      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByText("Growth highlight")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    });

    test("plural copy when several items were practiced", async () => {
      const user = userEvent.setup();
      mockApi.listGoals.mockResolvedValue([
        makeGoal({ title: "Two items", items: [makeItem({ customText: "x", evidence: [makeEvidence()] }), makeItem({ customText: "y", evidence: [makeEvidence()] })] })
      ]);
      renderGrowth();
      await user.click(await screen.findByRole("button", { name: /Two items/ }));
      expect(screen.getByText("Sam has practiced 2 things for this")).toBeInTheDocument();
      expect(within(screen.getByRole("button", { name: /^▸x/ })).getByText("1×")).toBeInTheDocument();
    });
  });
});
