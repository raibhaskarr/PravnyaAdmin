import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { VisualSchedule } from "../api/client";
import { ScheduleCard, VisualScheduleView } from "./VisualSchedules";

const step = (key: string, label: string, over: Partial<VisualSchedule["steps"][number]> = {}) => ({
  key,
  label,
  say: null,
  picture: { kind: "symbol" as const, symbolId: key, url: `https://cdn.example/${key}.svg` },
  minutes: null,
  ...over
});

const routine: VisualSchedule = {
  id: "11111111-1111-4111-8111-111111111111",
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
  steps: [step("a", "Toothpaste"), step("b", "Brush teeth", { minutes: 2, say: "Brush your teeth now" }), step("c", "Rinse", { picture: null })]
};

let spoken: string[] = [];
beforeEach(() => {
  localStorage.clear();
  spoken = [];
  class Utterance {
    lang = "";
    rate = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak: (u: Utterance) => spoken.push(u.text), cancel: () => {} } });
});

describe("picture schedules", () => {
  test("a routine: one step at a time, read aloud, Done moves on, progress kept for today", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<VisualScheduleView schedule={routine} onClose={() => {}} />);
    expect(screen.getByText("Now · 1/3")).toBeInTheDocument();
    expect(spoken).toEqual(["Toothpaste"]);

    await user.click(screen.getByRole("button", { name: "✓ Done" }));
    expect(screen.getByText("Now · 2/3")).toBeInTheDocument();
    // "say" is read instead of the label.
    expect(spoken.at(-1)).toBe("Brush your teeth now");
    // This step has a timer.
    await user.click(screen.getByRole("button", { name: /Start 2-minute timer/ }));
    expect(screen.getByRole("timer")).toHaveTextContent("2:00");

    // Reopening today continues where they were.
    unmount();
    render(<VisualScheduleView schedule={routine} onClose={() => {}} />);
    expect(screen.getByText("Now · 2/3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "✓ Done" }));
    await user.click(screen.getByRole("button", { name: "✓ Done" }));
    expect(screen.getByText("All done!")).toBeInTheDocument();
    expect(spoken.at(-1)).toBe("All done! Well done!");

    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByText("Now · 1/3")).toBeInTheDocument();
  });

  test("First / Then shows both pictures side by side, in Hindi when set", async () => {
    const user = userEvent.setup();
    const ft: VisualSchedule = { ...routine, kind: "FIRST_THEN", language: "hi", title: "पहले काम, फिर खेल", steps: [step("w", "काम"), step("p", "खेल")] };
    render(<VisualScheduleView schedule={ft} onClose={() => {}} />);
    expect(screen.getByText("पहले")).toBeInTheDocument();
    expect(screen.getByText("फिर")).toBeInTheDocument();
    expect(spoken).toEqual(["पहले काम"]);
    await user.click(screen.getByRole("button", { name: "✓ हो गया" }));
    expect(spoken.at(-1)).toBe("फिर खेल");
  });

  test("the list card shows its pictures and opens it", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ScheduleCard schedule={{ ...routine, days: ["Mon", "Wed"], timing: { time: "07:30", days: ["Mon", "Wed"], source: "learned" } }} onOpen={onOpen} />);
    expect(screen.getByText(/Routine · From Dr Rao · Sunrise Centre · Mon, Wed · Usually 7:30 am/)).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalled();
  });
});
