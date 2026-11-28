import { useEffect, useRef, useState } from "react";
import { assetUrl, type AacBoard, type AacCell } from "../api/client";
import { useBoardVoice } from "./voice";
import { CellFace } from "./shared";
import { TapLog } from "./taps";
import { inflect } from "./grammar";

// The child's talking board, full screen. Tap a word: it's said aloud (in the recorded voice, if
// someone recorded it, otherwise the phone's voice) and added to the sentence at
// the top; tap the sentence (or Speak) to say it all. A folder opens its page; Back and Home move
// between pages. Hidden buttons keep their square empty, so nothing moves as words are added.
// Leaving needs a press-and-hold, so a tap by the child doesn't close it.

const HOLD_MS = 1200;

export function AacTalk({ board, token, kidId, onClose, onEdit }: { board: AacBoard; token?: string; kidId?: string; onClose: () => void; onEdit?: () => void }) {
  const [pageId, setPageId] = useState(board.homePageId);
  const [history, setHistory] = useState<string[]>([]);
  const [sentence, setSentence] = useState<AacCell[]>([]);
  const voice = useBoardVoice(board.language === "hi" ? "hi-IN" : "en-IN");
  const page = board.pages.find((p) => p.id === pageId) ?? board.pages[0];
  // Core cells are pinned at the same squares on every page (motor-planning). A core cell's picture
  // is marked with a pin, so the child (and the adult modelling) gets a visual nudge that this
  // cell is in the same place everywhere.
  const core = board.coreCells ?? [];
  const cellsForPage = [...page.cells, ...core];
  // A page may override the board's grid size (e.g. Home 3×4, Food 3×3).
  const rows = page.rows ?? board.rows;
  const cols = page.cols ?? board.cols;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState<"exit" | "edit" | null>(null);

  const words = (cells: AacCell[]) => cells.map((c) => c.say ?? c.label);

  // Buffered log of every tap: cellId + pageId + label + word class + time, sent to the server
  // every ~20 s and on page hide. No audio, no sentence; used only for therapist stats and a
  // weekly summary for the parent.
  const log = useRef<TapLog | null>(null);
  useEffect(() => {
    if (!token || !kidId) return;
    const l = new TapLog(token, kidId);
    l.start();
    log.current = l;
    return () => l.stop();
  }, [token, kidId]);

  function tap(cell: AacCell) {
    log.current?.record({ cellId: cell.id, pageId: page.id, label: cell.label, wordClass: cell.wordClass, kind: cell.kind });
    if (cell.kind === "folder" && cell.targetPageId) {
      setHistory((h) => [...h, page.id]);
      setPageId(cell.targetPageId);
      return;
    }
    if (cell.kind === "affix" && cell.affix) {
      // Replace the last sentence word with its inflected form (eat + ed -> ate). Silent if the
      // sentence is empty or the last cell has no text.
      const affix = cell.affix;
      let inflected: AacCell | null = null;
      setSentence((s) => {
        if (!s.length) return s;
        const prev = s[s.length - 1];
        const base = prev.say ?? prev.label;
        const next = inflect(base, affix);
        inflected = { ...prev, id: prev.id + "+" + affix, label: next, say: next };
        return [...s.slice(0, -1), inflected];
      });
      if (inflected) void voice.say([inflected]);
      return;
    }
    setSentence((s) => [...s, cell].slice(-20));
    void voice.say([cell]);
  }

  function hold(what: "exit" | "edit", then: () => void) {
    setHolding(what);
    holdTimer.current = setTimeout(() => {
      setHolding(null);
      then();
    }, HOLD_MS);
  }
  function release() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setHolding(null);
  }
  const holdProps = (what: "exit" | "edit", then: () => void) => ({
    onPointerDown: () => hold(what, then),
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault()
  });

  return (
    <div className="flex h-dvh select-none flex-col bg-[#f3f4f6]" style={{ touchAction: "manipulation" }}>
      {/* Sentence bar */}
      <div className="flex items-stretch gap-2 border-b border-[var(--pv-border)] bg-white p-2">
        <button
          type="button"
          onClick={() => sentence.length && void voice.say(sentence)}
          className="flex min-h-[64px] min-w-0 flex-1 items-center gap-1.5 overflow-x-auto rounded-xl border-2 border-[var(--pv-border)] px-2 text-left"
          aria-label={sentence.length ? `Say: ${words(sentence).join(" ")}` : "Your words show here"}
        >
          {sentence.length === 0 ? <span className="text-sm text-[var(--pv-ink-faint)]">{board.language === "hi" ? "यहाँ शब्द आएँगे" : "Tap words to talk"}</span> : null}
          {sentence.map((c, i) => (
            <span key={i} className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center">
              {c.picture ? <img src={assetUrl(c.picture.url)} alt="" className="h-8 w-8 object-contain" /> : null}
              <span className="max-w-full truncate text-[0.65rem] font-bold">{c.label}</span>
            </span>
          ))}
        </button>
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => setSentence((s) => s.slice(0, -1))} aria-label="Delete last word" className="flex-1 rounded-lg bg-[var(--pv-surface)] px-3 text-lg">
            ⌫
          </button>
          <button type="button" onClick={() => setSentence([])} aria-label="Clear" className="flex-1 rounded-lg bg-[var(--pv-surface)] px-3 text-xs font-semibold">
            {board.language === "hi" ? "साफ़" : "Clear"}
          </button>
        </div>
      </div>

      {/* Page bar */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          disabled={!history.length}
          onClick={() => {
            setPageId(history[history.length - 1]);
            setHistory((h) => h.slice(0, -1));
          }}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold disabled:opacity-30"
        >
          ◀ {board.language === "hi" ? "वापस" : "Back"}
        </button>
        <button
          type="button"
          disabled={page.id === board.homePageId}
          onClick={() => {
            setPageId(board.homePageId);
            setHistory([]);
          }}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold disabled:opacity-30"
          aria-label="Home page"
        >
          🏠
        </button>
        <nav className="min-w-0 flex-1 overflow-x-auto text-center text-sm font-semibold" aria-label="Pages visited">
          {history.map((id, i) => {
            const p = board.pages.find((x) => x.id === id);
            if (!p) return null;
            return (
              <span key={`${id}-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    // Jump straight back to that page, dropping the trail after it.
                    setPageId(id);
                    setHistory((h) => h.slice(0, i));
                  }}
                  className="truncate text-[var(--pv-green-700)] hover:underline"
                >
                  {p.name}
                </button>
                <span className="mx-1 text-[var(--pv-ink-faint)]">▸</span>
              </span>
            );
          })}
          <span className="truncate text-[var(--pv-ink-soft)]">{page.name}</span>
        </nav>
        {onEdit ? (
          <button type="button" {...holdProps("edit", onEdit)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${holding === "edit" ? "bg-[var(--pv-green-100)]" : "bg-white"}`}>
            {holding === "edit" ? "Keep holding…" : "Hold to edit"}
          </button>
        ) : null}
        <button type="button" {...holdProps("exit", onClose)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${holding === "exit" ? "bg-[var(--pv-green-100)]" : "bg-white"}`} aria-label="Hold to close">
          {holding === "exit" ? "Keep holding…" : "Hold to close"}
        </button>
      </div>

      {/* The grid */}
      <div className="grid min-h-0 flex-1 gap-1.5 p-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const cell = cellsForPage.find((c) => c.row === row && c.col === col);
          if (!cell || cell.hidden) return <span key={i} aria-hidden="true" />;
          return (
            <button key={i} type="button" onClick={() => tap(cell)} className="min-h-0 min-w-0 active:scale-95" aria-label={cell.kind === "folder" ? `${cell.label} (opens a page)` : cell.label}>
              <CellFace cell={cell} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
