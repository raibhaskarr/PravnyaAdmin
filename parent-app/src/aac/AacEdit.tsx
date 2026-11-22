import { useState, type ReactNode } from "react";
import { ApiError, type AacBoardFields, type AacCell, type AacPage } from "../api/client";
import { PicturePicker } from "../schedules/ScheduleMaker";
import { CellFace, WORD_CLASSES } from "./shared";

// The parent changes the board: tap a button to change it (words, picture, colour, hide it for
// now), tap an empty square to add one, add or rename pages. Saving never overwrites a change the
// therapist made meanwhile: the app says so and reloads.

const uuid = () => crypto.randomUUID();
const input = "w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-3 py-2 text-[0.95rem] text-[var(--pv-ink)]";
const label = "text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]";

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-label={title}>
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl bg-[var(--pv-surface)] p-4 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">{title}</p>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-[var(--pv-ink-soft)]">
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AacEdit({
  token,
  kidId,
  initial,
  saveLabel = "Save board",
  onSave,
  onDelete,
  onCancel
}: {
  token: string;
  kidId: string;
  initial: AacBoardFields;
  saveLabel?: string;
  onSave: (b: AacBoardFields) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [b, setB] = useState(initial);
  const [pageId, setPageId] = useState(initial.homePageId);
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pageSheet, setPageSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const page = b.pages.find((p) => p.id === pageId) ?? b.pages[0];
  const cell = page.cells.find((c) => c.id === editing);
  const hi = b.language === "hi";

  const setPage = (p: AacPage) => setB((x) => ({ ...x, pages: x.pages.map((y) => (y.id === p.id ? p : y)) }));
  const setCell = (c: AacCell) => setPage({ ...page, cells: page.cells.map((x) => (x.id === c.id ? c : x)) });

  function addAt(row: number, col: number) {
    const c: AacCell = { id: uuid(), row, col, kind: "word", label: hi ? "नया शब्द" : "new word", say: null, picture: null, wordClass: "misc", targetPageId: null, hidden: false };
    setPage({ ...page, cells: [...page.cells, c] });
    setEditing(c.id);
  }

  function newPage(name: string) {
    const p: AacPage = { id: uuid(), name, cells: [] };
    setB((x) => ({ ...x, pages: [...x.pages, p] }));
    return p;
  }

  async function save() {
    setError("");
    const bad = b.pages.flatMap((p) => p.cells).find((c) => !c.label.trim() || (c.kind === "folder" && !c.targetPageId));
    if (bad) return setError(bad.label.trim() ? `The folder "${bad.label}" needs a page to open.` : "Every button needs a word.");
    setBusy(true);
    try {
      await onSave(b);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
        <button type="button" onClick={onCancel} className="text-sm font-semibold text-[var(--pv-ink-soft)]">
          Cancel
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-[1.05rem] font-semibold text-[var(--pv-ink)]">Edit board</p>
        <button type="button" onClick={save} disabled={busy} className="rounded-xl bg-[var(--pv-green-700)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Saving…" : saveLabel}
        </button>
      </header>
      {error ? <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-1.5 overflow-x-auto px-3 py-2">
        {b.pages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPageId(p.id)}
            className={`flex-shrink-0 rounded-full border px-3 py-1 text-sm ${p.id === page.id ? "border-[var(--pv-green-700)] bg-[var(--pv-green-700)] text-white" : "border-[var(--pv-border)] text-[var(--pv-ink-soft)]"}`}
          >
            {p.id === b.homePageId ? "🏠 " : ""}
            {p.name}
          </button>
        ))}
        <button type="button" onClick={() => setPageSheet(true)} className="flex-shrink-0 rounded-full border border-[var(--pv-border)] px-3 py-1 text-sm text-[var(--pv-ink-soft)]">
          ⚙ Pages & grid
        </button>
      </div>
      <p className="px-3 text-xs text-[var(--pv-ink-faint)]">Tap a button to change it, or an empty square to add one. Faded buttons are hidden from your child for now.</p>
      <div className="grid min-h-0 flex-1 gap-1.5 p-3" style={{ gridTemplateColumns: `repeat(${b.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${b.rows}, minmax(0, 1fr))` }}>
        {Array.from({ length: b.rows * b.cols }, (_, i) => {
          const row = Math.floor(i / b.cols);
          const col = i % b.cols;
          const c = page.cells.find((x) => x.row === row && x.col === col);
          return c ? (
            <button key={i} type="button" onClick={() => setEditing(c.id)} className="min-h-0 min-w-0" aria-label={`Change ${c.label}`}>
              <CellFace cell={c} dim={c.hidden} />
            </button>
          ) : (
            <button key={i} type="button" onClick={() => addAt(row, col)} className="min-h-0 min-w-0 rounded-xl border-2 border-dashed border-[var(--pv-border)] text-2xl text-[var(--pv-ink-faint)]" aria-label={`Add a button at row ${row + 1}, column ${col + 1}`}>
              +
            </button>
          );
        })}
      </div>

      {cell ? (
        <Sheet title="Button" onClose={() => setEditing(null)}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPicking(true)} className="h-24 w-24 flex-shrink-0" aria-label="Change picture">
              <CellFace cell={cell} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input className={input} value={cell.label} onChange={(e) => setCell({ ...cell, label: e.target.value })} maxLength={40} aria-label="Word" />
              <button type="button" onClick={() => setPicking(true)} className="self-start text-sm font-semibold text-[var(--pv-green-700)]">
                {cell.picture ? "Change picture" : "+ Add a picture or photo"}
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className={label}>Says (if different)</span>
            <input className={input} value={cell.say ?? ""} placeholder={cell.label} onChange={(e) => setCell({ ...cell, say: e.target.value || null })} maxLength={200} aria-label="Says" />
          </label>
          <div className="flex flex-col gap-1">
            <span className={label}>Colour (word type)</span>
            <div className="flex flex-wrap gap-1.5">
              {WORD_CLASSES.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  aria-pressed={cell.wordClass === w.value}
                  onClick={() => setCell({ ...cell, wordClass: w.value })}
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: w.bg, border: `2px solid ${cell.wordClass === w.value ? "#111" : w.border}` }}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[0.95rem]">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={cell.kind === "folder"}
              onChange={(e) => setCell({ ...cell, kind: e.target.checked ? "folder" : "word", targetPageId: e.target.checked ? (b.pages.find((p) => p.id !== page.id)?.id ?? null) : null })}
            />
            Opens another page (folder)
          </label>
          {cell.kind === "folder" ? (
            <div className="flex flex-col gap-1.5">
              <select className={input} value={cell.targetPageId ?? ""} onChange={(e) => setCell({ ...cell, targetPageId: e.target.value || null })} aria-label="Page it opens">
                <option value="">Choose a page…</option>
                {b.pages
                  .filter((p) => p.id !== page.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const p = newPage(cell.label);
                  setCell({ ...cell, targetPageId: p.id });
                }}
                className="self-start text-sm font-semibold text-[var(--pv-green-700)]"
              >
                + New page "{cell.label}"
              </button>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-[0.95rem]">
            <input type="checkbox" className="h-5 w-5" checked={cell.hidden} onChange={(e) => setCell({ ...cell, hidden: e.target.checked })} />
            Hide for now (keeps its place)
          </label>
          <button
            type="button"
            onClick={() => {
              setPage({ ...page, cells: page.cells.filter((x) => x.id !== cell.id) });
              setEditing(null);
            }}
            className="self-start text-sm font-semibold text-red-600"
          >
            Remove this button
          </button>
        </Sheet>
      ) : null}

      {pageSheet ? (
        <Sheet title="Pages & grid" onClose={() => setPageSheet(false)}>
          <label className="flex flex-col gap-1">
            <span className={label}>Board name</span>
            <input className={input} value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} maxLength={60} aria-label="Board name" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>This page's name</span>
            <input className={input} value={page.name} onChange={(e) => setPage({ ...page, name: e.target.value })} maxLength={40} aria-label="Page name" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setPageId(newPage(hi ? "नया पेज" : "New page").id)} className="text-sm font-semibold text-[var(--pv-green-700)]">
              + Add a page
            </button>
            {page.id !== b.homePageId ? (
              <>
                <button type="button" onClick={() => setB({ ...b, homePageId: page.id })} className="text-sm font-semibold text-[var(--pv-ink-soft)]">
                  Make this the first page
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Delete the page "${page.name}" and the folders that open it?`)) return;
                    setB({ ...b, pages: b.pages.filter((p) => p.id !== page.id).map((p) => ({ ...p, cells: p.cells.filter((c) => c.targetPageId !== page.id) })) });
                    setPageId(b.homePageId);
                  }}
                  className="text-sm font-semibold text-red-600"
                >
                  Delete this page
                </button>
              </>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <span className={label}>Grid (every page)</span>
            <select
              className={input}
              value={`${b.rows}x${b.cols}`}
              aria-label="Grid size"
              onChange={(e) => {
                const [rows, cols] = e.target.value.split("x").map(Number);
                const lost = b.pages.reduce((n, p) => n + p.cells.filter((c) => c.row >= rows || c.col >= cols).length, 0);
                if (lost && !window.confirm(`${lost} button${lost === 1 ? "" : "s"} won't fit and will be removed. Go ahead?`)) return;
                setB({ ...b, rows, cols, pages: b.pages.map((p) => ({ ...p, cells: p.cells.filter((c) => c.row < rows && c.col < cols) })) });
              }}
            >
              {[...new Set(["2x2", "2x3", "3x3", "3x4", "4x4", "4x5", "4x6", "5x6", "5x8", "6x8", "6x10", `${b.rows}x${b.cols}`])].map((s) => (
                <option key={s} value={s}>
                  {s.replace("x", " × ")} ({Number(s.split("x")[0]) * Number(s.split("x")[1])} buttons)
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className={label}>Speaks in</span>
            <select className={input} value={b.language} onChange={(e) => setB({ ...b, language: e.target.value as "en" | "hi" })} aria-label="Speaks in">
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
            </select>
          </div>
          {onDelete ? (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Delete the whole board? Your therapist loses it too. You can start again from a template.")) return;
                await onDelete();
              }}
              className="self-start text-sm font-semibold text-red-600"
            >
              Delete the whole board
            </button>
          ) : null}
        </Sheet>
      ) : null}

      {picking && cell ? (
        <PicturePicker
          token={token}
          kidId={kidId}
          initialQuery={b.language === "en" ? cell.label : ""}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setCell({ ...cell, picture: p });
            setPicking(false);
          }}
        />
      ) : null}
    </div>
  );
}
