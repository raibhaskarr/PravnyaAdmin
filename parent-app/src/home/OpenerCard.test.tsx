import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makeSlot } from "../test/fixtures";
import { OpenerCard, type Opener } from "./opener";

const NOW = new Date(2026, 10, 11, 17, 0);
const TODAY = NOW.toISOString().slice(0, 10);
const moment = { date: "2026-11-10T09:00:00.000Z", goalTitle: "Waves hello", title: "First independent success", environment: "Home" };

function renderCard(opener: Opener) {
  const onSeeGrowth = vi.fn();
  const onLogIt = vi.fn();
  const utils = render(<OpenerCard opener={opener} kidId="kid-1" kidName="Sam" onSeeGrowth={onSeeGrowth} onLogIt={onLogIt} />);
  return { ...utils, onSeeGrowth, onLogIt };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("<OpenerCard /> milestone", () => {
  test("phrases the moment about the kid (first letter lower-cased) and links to Growth", async () => {
    const { onSeeGrowth } = renderCard({ kind: "milestone", moment });
    expect(screen.getByText("Sam first independent success — nice work!")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See Growth" }));
    expect(onSeeGrowth).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Log it" })).not.toBeInTheDocument();
  });

  test("marks the moment seen on mount, before any tap", () => {
    renderCard({ kind: "milestone", moment });
    expect(localStorage.getItem("pravnya_seen_moment_kid-1")).toBe(`${moment.date}|Waves hello|First independent success`);
  });

  test("× dismisses it", async () => {
    renderCard({ kind: "milestone", moment });
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/nice work/)).not.toBeInTheDocument();
  });

  test("storage failures are swallowed", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => renderCard({ kind: "milestone", moment })).not.toThrow();
    expect(screen.getByText(/nice work/)).toBeInTheDocument();
  });
});

describe("<OpenerCard /> schedule", () => {
  const slot = makeSlot({ id: "slot-1", label: "Occupational therapy", dayOfWeek: "Wed", startTime: "15:00" });

  test("asks how the session went; Log it seeds the log text", async () => {
    const { onLogIt } = renderCard({ kind: "schedule", slot });
    expect(screen.getByText("Looks like Sam had Occupational therapy today — want to jot down how it went?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(onLogIt).toHaveBeenCalledWith("Occupational therapy today");
  });

  test("Not today hides it", async () => {
    renderCard({ kind: "schedule", slot });
    await userEvent.click(screen.getByRole("button", { name: "Not today" }));
    expect(screen.queryByText(/Looks like Sam/)).not.toBeInTheDocument();
  });

  test("records the slot as dismissed for today on mount, appending without duplicates", () => {
    const key = `pravnya_dismissed_slots_kid-1_${TODAY}`;
    localStorage.setItem(key, JSON.stringify(["other-slot"]));
    const { unmount } = renderCard({ kind: "schedule", slot });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(["other-slot", "slot-1"]);
    unmount();
    renderCard({ kind: "schedule", slot });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(["other-slot", "slot-1"]);
  });

  test("malformed stored dismissals don't crash the card", () => {
    localStorage.setItem(`pravnya_dismissed_slots_kid-1_${TODAY}`, "{nope");
    expect(() => renderCard({ kind: "schedule", slot })).not.toThrow();
    expect(screen.getByRole("button", { name: "Log it" })).toBeInTheDocument();
  });
});
