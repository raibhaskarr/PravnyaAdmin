import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { api, ApiError, type VisualSchedule } from "../api/client";
import { ScheduleEditor, ScheduleMaker } from "./ScheduleMaker";
import { TodaysSchedulesCard, VisualScheduleView } from "./VisualSchedules";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
vi.mock("./push", () => ({ pushState: vi.fn(async () => "off"), enablePush: vi.fn(async () => "on"), refreshPush: vi.fn() }));
const mockApi = vi.mocked(api);

const pic = (id: string) => ({ kind: "symbol" as const, symbolId: id, url: `https://cdn.example/${id}.svg` });

const schedule = (over: Partial<VisualSchedule> = {}): VisualSchedule => ({
  id: "vs-1",
  title: "Brushing teeth",
  kind: "ROUTINE",
  language: "en",
  source: "THERAPIST",
  mine: false,
  authorName: "Dr Rao",
  centreName: "",
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
    { key: "a", label: "Toothpaste", say: null, picture: pic("toothpaste"), minutes: null },
    { key: "b", label: "Brush", say: null, picture: null, minutes: null }
  ],
  ...over
});

describe("parents make picture schedules", () => {
  test("type what you need -> Pravnya drafts it -> check, change and save", async () => {
    const user = userEvent.setup();
    mockApi.draftVisualSchedule.mockResolvedValue({
      title: "Bath time",
      kind: "ROUTINE",
      language: "en",
      time: "19:30",
      days: [],
      steps: [
        { key: "1", label: "Clothes off", say: null, picture: pic("get_undressed_,_to"), minutes: null },
        { key: "2", label: "Bath", say: null, picture: pic("bath"), minutes: 10 }
      ]
    });
    mockApi.createVisualSchedule.mockResolvedValue(schedule());
    const onSaved = vi.fn();
    render(<ScheduleMaker token="tok" kidId="kid-1" kidName="Sam" onSaved={onSaved} onCancel={() => {}} />);

    await user.type(screen.getByLabelText("Describe the schedule"), "bath time every evening at 7:30");
    await user.click(screen.getByRole("button", { name: "हिंदी" }));
    await user.click(screen.getByRole("button", { name: "Make it" }));
    expect(mockApi.draftVisualSchedule).toHaveBeenCalledWith("tok", "kid-1", { text: "bath time every evening at 7:30", kind: null, language: "hi" });

    expect(await screen.findByText("Check your schedule")).toBeInTheDocument();
    expect(screen.getByLabelText("Usual time")).toHaveValue("19:30");
    await user.click(screen.getByRole("button", { name: "+ Add a step" }));
    await user.type(screen.getByLabelText("Step 3 label"), "Towel");
    await user.click(screen.getByRole("button", { name: "Sat" }));
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    const [, , fields] = mockApi.createVisualSchedule.mock.calls[0];
    expect(fields).toMatchObject({ title: "Bath time", kind: "ROUTINE", time: "19:30", days: ["Sat"], remind: true });
    expect(fields.steps.map((s) => s.label)).toEqual(["Clothes off", "Bath", "Towel"]);
    expect(onSaved).toHaveBeenCalled();
  });

  test("when the AI can't help, the parent can start blank; empty labels are caught", async () => {
    const user = userEvent.setup();
    mockApi.draftVisualSchedule.mockRejectedValue(new ApiError(503, "AI down"));
    render(<ScheduleMaker token="tok" kidId="kid-1" kidName="Sam" onSaved={() => {}} onCancel={() => {}} />);
    await user.type(screen.getByLabelText("Describe the schedule"), "park");
    await user.click(screen.getByRole("button", { name: "Make it" }));
    expect(await screen.findByText(/couldn't make this right now/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Or start with a blank one" }));
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(screen.getByText(/every step a label/)).toBeInTheDocument();
    expect(mockApi.createVisualSchedule).not.toHaveBeenCalled();
  });

  test("start from a ready-made template (centre's or Pravnya's): a copy to change, then save", async () => {
    const user = userEvent.setup();
    mockApi.listScheduleTemplates.mockResolvedValue([
      { id: "t-1", scope: "CENTRE", title: "Circle time", kind: "ROUTINE", language: "en", days: [], time: "10:00", steps: [
        { key: "x", label: "Sit", say: null, picture: { kind: "photo", mediaId: "m-1", url: "/api/media/m-1?exp=1&sig=s" }, minutes: null },
        { key: "y", label: "Sing", say: null, picture: pic("sing_,_to"), minutes: null }
      ] },
      { id: "t-2", scope: "PRAVNYA", title: "Bedtime", kind: "ROUTINE", language: "en", days: [], time: null, steps: [
        { key: "a", label: "Bath", say: null, picture: pic("bath"), minutes: null },
        { key: "b", label: "Bed", say: null, picture: pic("bed_time"), minutes: null }
      ] }
    ]);
    mockApi.createVisualSchedule.mockResolvedValue(schedule());
    render(<ScheduleMaker token="tok" kidId="kid-1" kidName="Sam" onSaved={() => {}} onCancel={() => {}} />);
    expect(await screen.findByText("From your centre", { exact: false })).toBeInTheDocument();
    expect(mockApi.listScheduleTemplates).toHaveBeenCalledWith("tok", "kid-1", "en");
    await user.click(screen.getByRole("button", { name: /Circle time/ }));
    expect(screen.getByLabelText("Step 1 label")).toHaveValue("Sit");
    expect(screen.getByLabelText("Usual time")).toHaveValue("10:00");
    await user.clear(screen.getByLabelText("Step 2 label"));
    await user.type(screen.getByLabelText("Step 2 label"), "Hello song");
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    const [, , fields] = mockApi.createVisualSchedule.mock.calls[0];
    expect(fields.title).toBe("Circle time");
    expect(fields.steps.map((s) => s.label)).toEqual(["Sit", "Hello song"]);
    // Fresh step keys: the copy is the family's own.
    expect(fields.steps[0].key).not.toBe("x");
  });

  test("a therapist's schedule: only the time and reminder can be changed", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    const s = schedule();
    render(
      <ScheduleEditor
        token="tok"
        kidId="kid-1"
        title="Time and reminder"
        initial={{ title: s.title, kind: s.kind, language: s.language, steps: s.steps, days: [], time: null, remind: true }}
        timingOnly
        learnedTime="07:35"
        saveLabel="Save"
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByLabelText("Step 1 label")).not.toBeInTheDocument();
    expect(screen.getByText(/usually open it around 07:35/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Usual time"), "07:45");
    await user.click(screen.getByRole("checkbox", { name: /Remind me/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ time: "07:45", remind: false }));
  });
});

describe("schedules at the right time", () => {
  test("Home: the one due now comes first; the rest of today follow; reminders are offered", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <TodaysSchedulesCard
        token="tok"
        kidName="Sam"
        onOpen={onOpen}
        schedules={[
          schedule({ id: "later", title: "Bedtime", timing: { time: "20:30", days: [], source: "set" }, minutesUntil: 600 }),
          schedule({ id: "now", title: "Morning", timing: { time: "07:30", days: [], source: "learned" }, dueNow: true, minutesUntil: 10 }),
          schedule({ id: "other-day", title: "Park", forToday: false })
        ]}
      />
    );
    const nowCard = screen.getByText("Time for").closest("button")!;
    expect(within(nowCard).getByText("Morning")).toBeInTheDocument();
    expect(within(nowCard).getByText("Usually 7:30 am")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bedtime.*8:30 pm/ })).toBeInTheDocument();
    expect(screen.queryByText("Park")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Turn on reminders" })).toBeInTheDocument();
    await user.click(nowCard);
    expect(onOpen).toHaveBeenCalledWith("now");
  });

  test("opening and finishing a schedule are recorded (that's how its usual time is learned)", async () => {
    const user = userEvent.setup();
    mockApi.recordScheduleUse.mockResolvedValue({ ok: true });
    render(<VisualScheduleView schedule={schedule({ id: "vs-9" })} token="tok" kidId="kid-1" onClose={() => {}} onEdit={() => {}} />);
    expect(mockApi.recordScheduleUse).toHaveBeenCalledWith("tok", "kid-1", "vs-9", "start");
    await user.click(screen.getByRole("button", { name: "✓ Done" }));
    await user.click(screen.getByRole("button", { name: "✓ Done" }));
    expect(mockApi.recordScheduleUse).toHaveBeenLastCalledWith("tok", "kid-1", "vs-9", "complete");
    expect(screen.getByRole("button", { name: "Time" })).toBeInTheDocument();
  });
});
