import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, type AacBoard, type AacCell, type AacTemplate } from "../api/client";
import { AacTalk } from "./AacTalk";
import { AacEdit } from "./AacEdit";
import { AacSetup } from "./AacSetup";
import { loadBoardOffline, saveBoardOffline } from "./shared";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const cell = (row: number, col: number, label: string, over: Partial<AacCell> = {}): AacCell => ({
  id: `${label}-${row}-${col}`,
  row,
  col,
  kind: "word",
  label,
  say: null,
  picture: { kind: "symbol", symbolId: label, url: `https://cdn.example/${label}.svg` },
  wordClass: "verb",
  targetPageId: null,
  hidden: false,
  ...over
});

const board = (over: Partial<AacBoard> = {}): AacBoard => ({
  id: "b-1",
  kidId: "kid-1",
  name: "Sam's board",
  language: "en",
  rows: 2,
  cols: 3,
  homePageId: "home",
  version: 3,
  updatedByName: "Dr Rao",
  updatedAt: "2026-11-20T10:00:00Z",
  credit: "",
  pages: [
    {
      id: "home",
      name: "Home",
      cells: [
        cell(0, 0, "I", { wordClass: "pronoun" }),
        cell(0, 1, "want"),
        cell(0, 2, "stop", { hidden: true }),
        cell(1, 0, "Food", { kind: "folder", targetPageId: "food", wordClass: "misc" }),
        cell(1, 1, "more", { say: "more please", wordClass: "describe" })
      ]
    },
    { id: "food", name: "Food", cells: [cell(0, 0, "apple", { wordClass: "noun" })] }
  ],
  ...over
});

let spoken: { text: string; lang: string }[] = [];
beforeEach(() => {
  spoken = [];
  localStorage.clear();
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
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak: (u: Utterance) => spoken.push({ text: u.text, lang: u.lang }), cancel: () => {} } });
});

describe("the child's talking board", () => {
  test("tapping words says them and builds a sentence; a folder opens its page; Back and Home return", async () => {
    const user = userEvent.setup();
    render(<AacTalk board={board()} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "I" }));
    await user.click(screen.getByRole("button", { name: "want" }));
    expect(spoken.map((s) => s.text)).toEqual(["I", "want"]);
    expect(spoken[0].lang).toBe("en-IN");

    // A hidden word keeps its square but isn't a button.
    expect(screen.queryByRole("button", { name: "stop" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Food (opens a page)" }));
    expect(screen.getByText("Food", { selector: "span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "apple" }));
    await user.click(screen.getByRole("button", { name: /Back/ }));
    await user.click(screen.getByRole("button", { name: "more" }));
    // "Says" is spoken instead of the label.
    expect(spoken.at(-1)!.text).toBe("more please");

    // Tap the sentence: all of it.
    await user.click(screen.getByRole("button", { name: "Say: I want apple more please" }));
    expect(spoken.at(-1)!.text).toBe("I want apple more please");
    await user.click(screen.getByRole("button", { name: "Delete last word" }));
    expect(screen.getByRole("button", { name: "Say: I want apple" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Tap words to talk")).toBeInTheDocument();
  });

  test("Hindi boards speak Hindi; closing needs a press-and-hold", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<AacTalk board={board({ language: "hi" })} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "want" }));
    expect(spoken[0].lang).toBe("hi-IN");
    const close = screen.getByRole("button", { name: "Hold to close" });
    fireEvent.click(close);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(close);
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.pointerUp(close);
    act(() => void vi.advanceTimersByTime(2000));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(close);
    act(() => void vi.advanceTimersByTime(1300));
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  test("the board is kept on the phone for offline use", () => {
    expect(loadBoardOffline("kid-1")).toBeNull();
    saveBoardOffline("kid-1", board());
    expect(loadBoardOffline("kid-1")!.name).toBe("Sam's board");
    saveBoardOffline("kid-1", null);
    expect(loadBoardOffline("kid-1")).toBeNull();
  });
});

describe("the parent changes the board", () => {
  test("change a word, hide one, add a folder with a new page, then save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async (_b: import("../api/client").AacBoardFields) => {});
    render(<AacEdit token="tok" kidId="kid-1" initial={board()} onSave={onSave} onCancel={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Change want" }));
    const sheet = screen.getByRole("dialog", { name: "Button" });
    await user.clear(within(sheet).getByLabelText("Word"));
    await user.type(within(sheet).getByLabelText("Word"), "need");
    await user.click(within(sheet).getByRole("button", { name: "Things" }));
    await user.click(within(sheet).getByRole("checkbox", { name: /Hide for now/ }));
    await user.click(within(sheet).getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Add a button at row 2, column 3" }));
    const sheet2 = screen.getByRole("dialog", { name: "Button" });
    await user.clear(within(sheet2).getByLabelText("Word"));
    await user.type(within(sheet2).getByLabelText("Word"), "Toys");
    await user.click(within(sheet2).getByRole("checkbox", { name: /Opens another page/ }));
    await user.click(within(sheet2).getByRole("button", { name: /New page "Toys"/ }));
    await user.click(within(sheet2).getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Save board" }));
    const saved = onSave.mock.calls[0][0];
    const home = saved.pages.find((p) => p.id === "home")!;
    expect(home.cells.find((c) => c.id === "want-0-1")).toMatchObject({ label: "need", wordClass: "noun", hidden: true });
    const toys = home.cells.find((c) => c.label === "Toys")!;
    expect(toys).toMatchObject({ kind: "folder", row: 1, col: 2 });
    expect(saved.pages.find((p) => p.id === toys.targetPageId)!.name).toBe("Toys");
  });

  test("an empty word is caught before saving; a conflicting save shows the server's message", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValueOnce(new ApiError(409, "Someone else changed this board since you opened it."));
    render(<AacEdit token="tok" kidId="kid-1" initial={board()} onSave={onSave} onCancel={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Change I" }));
    await user.clear(screen.getByLabelText("Word"));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Save board" }));
    expect(screen.getByText("Every button needs a word.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.type(screen.getByLabelText("Word"), "me");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Save board" }));
    expect(await screen.findByText(/Someone else changed this board/)).toBeInTheDocument();
  });
});

describe("setting up a board", () => {
  test("from a ready-made board (copied, named for the child) in the chosen language", async () => {
    const user = userEvent.setup();
    const tpl: AacTemplate = { ...board(), id: "t-1", name: "Core words", scope: "PRAVNYA", builtIn: true };
    mockApi.listAacTemplates.mockResolvedValue([tpl]);
    mockApi.createAacBoard.mockResolvedValue(board());
    const onMade = vi.fn();
    render(<AacSetup token="tok" kidId="kid-1" kidName="Sam" onMade={onMade} onCancel={() => {}} />);
    await user.click(screen.getByRole("button", { name: "हिंदी" }));
    expect(mockApi.listAacTemplates).toHaveBeenLastCalledWith("tok", "kid-1", "hi");
    await user.click(await screen.findByRole("button", { name: /Core words/ }));
    expect(mockApi.createAacBoard).toHaveBeenCalledWith("tok", "kid-1", expect.objectContaining({ name: "Sam's board", rows: 2, cols: 3, homePageId: "home" }));
    expect(onMade).toHaveBeenCalled();
  });
});
