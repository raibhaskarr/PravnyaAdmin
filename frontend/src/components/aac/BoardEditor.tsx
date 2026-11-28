import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { api, ApiError, assetUrl } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { AacAffix, AacBoardFields, AacCell, AacPage, AacWordClass } from "../../api/types";
import { LANGUAGES, PicturePicker, SYMBOL_CREDIT, type PhotoTarget } from "../schedules/ScheduleForm";

// The AAC board editor shared by a child's board and the AAC templates: board settings, pages,
// and a grid of buttons. Words never need to move as vocabulary grows: hide a button instead of
// deleting it, and its square stays reserved.

export const WORD_CLASSES: { value: AacWordClass; label: string; bg: string; border: string }[] = [
  { value: "pronoun", label: "People / pronouns", bg: "#fff6bf", border: "#d6b600" },
  { value: "verb", label: "Actions (verbs)", bg: "#d8f3d0", border: "#3c9a32" },
  { value: "describe", label: "Describing words", bg: "#d6e7ff", border: "#3d7ad6" },
  { value: "noun", label: "Things (nouns)", bg: "#ffe4c2", border: "#e08a1e" },
  { value: "social", label: "Social words", bg: "#ffd9ec", border: "#d4508c" },
  { value: "question", label: "Questions", bg: "#ece0ff", border: "#8457d6" },
  { value: "misc", label: "Other", bg: "#ffffff", border: "#b9b9b9" }
];
const COLOUR = Object.fromEntries(WORD_CLASSES.map((w) => [w.value, w])) as Record<AacWordClass, (typeof WORD_CLASSES)[number]>;

// Grammar-affix cells: tapped after a word, they replace the sentence's last word with its inflected
// form (eat + ed -> ate). The label the parent sees is "+ ed" etc.
const AFFIX_OPTIONS: { value: AacAffix; label: string }[] = [
  { value: "ed", label: "+ ed (past)" },
  { value: "ing", label: "+ ing" },
  { value: "s", label: "+ s (plural / 3rd person)" },
  { value: "'s", label: "+ 's (possessive)" }
];
const AFFIX_LABEL: Record<AacAffix, string> = { ed: "+ ed", ing: "+ ing", s: "+ s", "'s": "+ 's" };

const KIND_OPTIONS: { value: AacCell["kind"]; label: string }[] = [
  { value: "word", label: "Word" },
  { value: "folder", label: "Folder (opens a page)" },
  { value: "affix", label: "Grammar affix" }
];

const uuid = () => crypto.randomUUID();

/** A new board: one home page, empty. */
export function blankBoard(name: string, language: "en" | "hi", rows: number, cols: number): AacBoardFields {
  const home = uuid();
  return { name, language, rows, cols, homePageId: home, pages: [{ id: home, name: language === "hi" ? "होम" : "Home", cells: [] }] };
}

// Fitzgerald Key legend: parents learn the colour code quicker if the names sit next to the
// swatches in the editor, rather than only showing up in the cell-type dropdown.
function WordClassLegend() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center", fontSize: 12, color: "var(--text-color-secondary, #666)" }} aria-label="Word colour key">
      <span style={{ fontWeight: 600 }}>Colour key:</span>
      {WORD_CLASSES.map((c) => (
        <span key={c.value} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span aria-hidden="true" style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: c.bg, border: `2px solid ${c.border}` }} />
          {c.label.replace(/ \(.*\)/, "")}
        </span>
      ))}
    </div>
  );
}

function CellFace({ cell, size }: { cell: AacCell; size: number }) {
  const c = COLOUR[cell.wordClass];
  return (
    <div
      style={{
        width: size,
        height: size,
        background: c.bg,
        border: `3px solid ${c.border}`,
        borderRadius: cell.kind === "folder" ? "4px 14px 4px 4px" : 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        opacity: cell.hidden ? 0.35 : 1,
        position: "relative",
        overflow: "hidden"
      }}
    >
      {cell.picture?.url ? <img src={assetUrl(cell.picture.url)} alt="" style={{ width: size * 0.58, height: size * 0.58, objectFit: "contain" }} /> : null}
      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.1, textAlign: "center", padding: "0 3px" }}>{cell.label}</span>
      {cell.kind === "folder" ? <i className="pi pi-folder" style={{ position: "absolute", top: 3, right: 4, fontSize: 11 }} /> : null}
      {(cell as AacCell & { core?: boolean }).core ? <i className="pi pi-bookmark-fill" style={{ position: "absolute", top: 3, right: 4, fontSize: 11, color: "#6366f1" }} title="On every page (core)" /> : null}
      {cell.hidden ? <i className="pi pi-eye-slash" style={{ position: "absolute", top: 3, left: 4, fontSize: 11 }} /> : null}
    </div>
  );
}

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

/** Record a voice for a button on a child's board (a therapist's pronunciation of a target word). */
function VoiceControl({ kidId, cell, language, disabled, onChange }: { kidId: string; cell: AacCell; language: "en" | "hi"; disabled: boolean; onChange: (audio: AacCell["audio"]) => void }) {
  const { token } = useAuth();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  useEffect(() => () => (rec.current?.state === "recording" ? rec.current.stop() : undefined), []);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        if (!blob.size) return;
        setBusy(true);
        try {
          const dataUrl = await new Promise<string>((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result as string);
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(blob);
          });
          const { id, url } = await api.uploadAudio(token!, kidId, dataUrl.slice(dataUrl.indexOf(",") + 1));
          onChange({ mediaId: id, url });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Couldn't save the recording.");
        } finally {
          setBusy(false);
        }
      };
      rec.current = r;
      r.start();
      setRecording(true);
      setTimeout(() => r.state === "recording" && r.stop(), 10_000);
    } catch {
      setError("Couldn't use the microphone. Allow it in the browser and try again.");
    }
  }

  function play() {
    if (cell.audio?.url) void new Audio(assetUrl(cell.audio.url)).play().catch(() => {});
    else {
      const u = new SpeechSynthesisUtterance(cell.say ?? cell.label);
      u.lang = language === "hi" ? "hi-IN" : "en-IN";
      window.speechSynthesis?.speak(u);
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <span className="field-label">Voice</span>
      {!disabled ? (
        recording ? (
          <Button label="Stop recording" icon="pi pi-stop-circle" className="p-button-danger p-button-sm" onClick={() => rec.current?.stop()} />
        ) : (
          <Button label={cell.audio ? "Record again" : "Record a voice"} icon="pi pi-microphone" className="p-button-outlined p-button-sm" loading={busy} onClick={start} />
        )
      ) : null}
      <Button label="Hear it" icon="pi pi-volume-up" className="p-button-text p-button-sm" onClick={play} />
      {cell.audio && !disabled ? <Button label="Use the device voice" className="p-button-text p-button-danger p-button-sm" onClick={() => onChange(null)} /> : null}
      <span className="hint-text">{cell.audio ? "A recording plays when this is tapped." : "No recording: the phone's voice says it."} Up to 10 seconds; it stays with this child only.</span>
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}

export function BoardEditor({ value, onChange, disabled, photos }: { value: AacBoardFields; onChange: (b: AacBoardFields) => void; disabled: boolean; photos: PhotoTarget }) {
  const [pageId, setPageId] = useState(value.homePageId);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const page = value.pages.find((p) => p.id === pageId) ?? value.pages[0];
  const core = value.coreCells ?? [];
  const coreAt = (row: number, col: number) => core.find((c) => c.row === row && c.col === col);
  const pageCellAt = (row: number, col: number) => page.cells.find((c) => c.row === row && c.col === col);
  // When editing, a square is one of: a core cell (shown on every page), a page cell, or empty.
  const cellAt = (row: number, col: number): (AacCell & { core?: boolean }) | undefined => {
    const c = coreAt(row, col);
    if (c) return { ...c, core: true };
    return pageCellAt(row, col);
  };
  const sel = selected ? cellAt(selected.row, selected.col) : undefined;
  // The current page's grid: its own rows/cols if set, otherwise the board defaults.
  const pageRows = page.rows ?? value.rows;
  const pageCols = page.cols ?? value.cols;
  const size = Math.max(64, Math.min(104, Math.floor(760 / pageCols)));

  const setPages = (pages: AacPage[], patch: Partial<AacBoardFields> = {}) => onChange({ ...value, ...patch, pages });
  const setPage = (p: AacPage) => setPages(value.pages.map((x) => (x.id === p.id ? p : x)));
  const setCoreCells = (cells: AacCell[]) => onChange({ ...value, coreCells: cells });
  const setCell = (c: AacCell & { core?: boolean }) => {
    if (c.core) {
      setCoreCells(core.some((x) => x.id === c.id) ? core.map((x) => (x.id === c.id ? c : x)) : [...core, c]);
    } else {
      setPage({ ...page, cells: page.cells.some((x) => x.id === c.id) ? page.cells.map((x) => (x.id === c.id ? c : x)) : [...page.cells, c] });
    }
  };
  const pinToCore = () => {
    if (!sel || sel.core) return;
    // Move the cell out of this page and into the board-level core strip.
    setPage({ ...page, cells: page.cells.filter((x) => x.id !== sel.id) });
    setCoreCells([...core, { ...sel, kind: "word", targetPageId: null, affix: null }]);
  };
  const unpinFromCore = () => {
    if (!sel || !sel.core) return;
    // Put it back on the current page so it isn't lost.
    setCoreCells(core.filter((x) => x.id !== sel.id));
    setPage({ ...page, cells: [...page.cells, { id: sel.id, row: sel.row, col: sel.col, kind: sel.kind, label: sel.label, say: sel.say, picture: sel.picture, wordClass: sel.wordClass, targetPageId: sel.targetPageId, affix: sel.affix, hidden: sel.hidden, audio: sel.audio }] });
  };

  function resize(rows: number, cols: number) {
    // Board-level rows/cols applies to pages that don't override their own grid.
    const affectedPages = value.pages.filter((p) => p.rows === undefined && p.cols === undefined);
    const outside = affectedPages.reduce((n, p) => n + p.cells.filter((c) => c.row >= rows || c.col >= cols).length, 0);
    if (outside && !window.confirm(`${outside} button${outside === 1 ? "" : "s"} would fall outside the smaller grid and be removed. Go ahead?`)) return;
    setSelected(null);
    onChange({
      ...value,
      rows,
      cols,
      pages: value.pages.map((p) => (p.rows === undefined && p.cols === undefined ? { ...p, cells: p.cells.filter((c) => c.row < rows && c.col < cols) } : p))
    });
  }

  /** Change this one page's grid (leaves the rest of the board alone). */
  function resizePage(rows: number, cols: number) {
    const outside = page.cells.filter((c) => c.row >= rows || c.col >= cols).length;
    if (outside && !window.confirm(`${outside} button${outside === 1 ? "" : "s"} on this page would fall outside the smaller grid and be removed. Go ahead?`)) return;
    setSelected(null);
    setPage({ ...page, rows, cols, cells: page.cells.filter((c) => c.row < rows && c.col < cols) });
  }

  function addPage(name = value.language === "hi" ? "नया पेज" : "New page") {
    const p: AacPage = { id: uuid(), name, cells: [] };
    setPages([...value.pages, p]);
    return p;
  }

  function deletePage() {
    if (page.id === value.homePageId) return;
    const links = value.pages.reduce((n, p) => n + p.cells.filter((c) => c.targetPageId === page.id).length, 0);
    if (!window.confirm(`Delete the page "${page.name}"${links ? ` and the ${links} folder button${links === 1 ? "" : "s"} that open it` : ""}?`)) return;
    setPages(value.pages.filter((p) => p.id !== page.id).map((p) => ({ ...p, cells: p.cells.filter((c) => c.targetPageId !== page.id) })));
    setPageId(value.homePageId);
    setSelected(null);
  }

  function newCellAt(row: number, col: number) {
    if (disabled) return;
    setSelected({ row, col });
    setCell({ id: uuid(), row, col, kind: "word", label: value.language === "hi" ? "नया शब्द" : "new word", say: null, picture: null, wordClass: "misc", targetPageId: null, affix: null, hidden: false, audio: null });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
      <div className="field-grid">
        <label className="field">
          <span className="field-label">Board name</span>
          <InputText value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} maxLength={60} disabled={disabled} />
        </label>
        <label className="field">
          <span className="field-label">Speaks in</span>
          <Dropdown value={value.language} options={LANGUAGES} onChange={(e) => onChange({ ...value, language: e.value })} disabled={disabled} />
        </label>
        <div className="field">
          <span className="field-label">Grid (rows × columns, every page)</span>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <InputNumber value={value.rows} min={1} max={8} showButtons inputStyle={{ width: 50 }} onValueChange={(e) => e.value && resize(e.value, value.cols)} disabled={disabled} aria-label="Rows" />
            ×
            <InputNumber value={value.cols} min={1} max={10} showButtons inputStyle={{ width: 50 }} onValueChange={(e) => e.value && resize(value.rows, e.value)} disabled={disabled} aria-label="Columns" />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
        {value.pages.map((p) => (
          <Button
            key={p.id}
            label={`${p.id === value.homePageId ? "★ " : ""}${p.name}`}
            className={`p-button-sm ${p.id === page.id ? "" : "p-button-outlined"}`}
            onClick={() => {
              setPageId(p.id);
              setSelected(null);
            }}
          />
        ))}
        {!disabled ? <Button label="Add page" icon="pi pi-plus" className="p-button-text p-button-sm" onClick={() => setPageId(addPage().id)} /> : null}
      </div>
      {!disabled ? (
        <>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="field-label">This page</span>
            <InputText value={page.name} onChange={(e) => setPage({ ...page, name: e.target.value })} maxLength={40} aria-label="Page name" />
            {page.id !== value.homePageId ? (
              <>
                <Button label="Make it the home page" className="p-button-text p-button-sm" onClick={() => onChange({ ...value, homePageId: page.id })} />
                <Button label="Delete page" className="p-button-text p-button-danger p-button-sm" onClick={deletePage} />
              </>
            ) : (
              <span className="hint-text">The home page opens first.</span>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="field-label">This page's grid</span>
            <InputNumber value={pageRows} min={1} max={8} showButtons inputStyle={{ width: 50 }} onValueChange={(e) => e.value && resizePage(e.value, pageCols)} aria-label="Rows on this page" />
            <span>×</span>
            <InputNumber value={pageCols} min={1} max={10} showButtons inputStyle={{ width: 50 }} onValueChange={(e) => e.value && resizePage(pageRows, e.value)} aria-label="Columns on this page" />
            {page.rows !== undefined || page.cols !== undefined ? (
              <Button
                label={`Use the board default (${value.rows}×${value.cols})`}
                className="p-button-text p-button-sm"
                onClick={() => {
                  const next = { ...page };
                  delete next.rows;
                  delete next.cols;
                  setPage(next);
                }}
              />
            ) : (
              <span className="hint-text">Inherits the board default ({value.rows}×{value.cols}).</span>
            )}
          </div>
        </>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${pageCols}, ${size}px)`, gap: 6, padding: 8, background: "#f3f4f6", borderRadius: 12, width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
        {Array.from({ length: pageRows * pageCols }, (_, i) => {
          const row = Math.floor(i / pageCols);
          const col = i % pageCols;
          const c = cellAt(row, col);
          const isSel = selected?.row === row && selected?.col === col;
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              onClick={() => (c ? setSelected({ row, col }) : newCellAt(row, col))}
              aria-label={c ? `${c.label}${c.hidden ? " (hidden)" : ""}` : `Empty square ${row + 1},${col + 1}`}
              style={{ padding: 0, border: 0, background: "none", cursor: disabled && !c ? "default" : "pointer", outline: isSel ? "3px solid #6366f1" : "none", outlineOffset: 2, borderRadius: 10 }}
            >
              {c ? (
                <CellFace cell={c} size={size} />
              ) : (
                <div style={{ width: size, height: size, border: "2px dashed #cfcfcf", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 22 }}>{disabled ? "" : "+"}</div>
              )}
            </button>
          );
        })}
      </div>
      <WordClassLegend />
      {page.cells.some((c) => c.hidden) ? (
        <span className="hint-text" style={{ fontSize: 12 }}>
          {page.cells.filter((c) => c.hidden).length} hidden cell{page.cells.filter((c) => c.hidden).length === 1 ? "" : "s"} on this page. They're greyed out above — tap any to bring it back.
        </span>
      ) : null}
      <span className="hint-text" style={{ fontSize: 11 }}>
        Click a button to change it, or an empty square to add one. Colours follow the word type (a common AAC colour code). {SYMBOL_CREDIT}
      </span>

      {sel ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => !disabled && setPicking(true)} style={{ padding: 0, border: 0, background: "none", cursor: disabled ? "default" : "pointer" }} aria-label="Change picture">
              <CellFace cell={sel} size={88} />
            </button>
            <div className="field-grid" style={{ flex: 1 }}>
              <label className="field">
                <span className="field-label">Label</span>
                <InputText value={sel.label} onChange={(e) => setCell({ ...sel, label: e.target.value })} maxLength={40} disabled={disabled} />
              </label>
              {sel.kind !== "affix" ? (
                <label className="field">
                  <span className="field-label">Says (if different)</span>
                  <InputText value={sel.say ?? ""} onChange={(e) => setCell({ ...sel, say: e.target.value || null })} maxLength={200} disabled={disabled} placeholder={sel.label} />
                </label>
              ) : null}
              <label className="field">
                <span className="field-label">Word type (colour)</span>
                <Dropdown value={sel.wordClass} options={WORD_CLASSES} optionLabel="label" optionValue="value" onChange={(e) => setCell({ ...sel, wordClass: e.value })} disabled={disabled} />
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Button does</span>
              <Dropdown
                value={sel.kind}
                options={KIND_OPTIONS}
                optionLabel="label"
                optionValue="value"
                disabled={disabled}
                onChange={(e) => {
                  const kind = e.value as AacCell["kind"];
                  if (kind === "folder") {
                    setCell({ ...sel, kind, targetPageId: value.pages.find((p) => p.id !== page.id)?.id ?? null, affix: null });
                  } else if (kind === "affix") {
                    const affix: AacAffix = sel.affix ?? "ed";
                    setCell({ ...sel, kind, targetPageId: null, affix, label: AFFIX_LABEL[affix], say: null, picture: null });
                  } else {
                    setCell({ ...sel, kind, targetPageId: null, affix: null });
                  }
                }}
              />
            </label>
            {sel.kind === "affix" ? (
              <label className="field" style={{ margin: 0 }}>
                <span className="field-label">Which affix</span>
                <Dropdown
                  value={sel.affix ?? "ed"}
                  options={AFFIX_OPTIONS}
                  optionLabel="label"
                  optionValue="value"
                  disabled={disabled}
                  onChange={(e) => {
                    const affix = e.value as AacAffix;
                    setCell({ ...sel, affix, label: AFFIX_LABEL[affix] });
                  }}
                />
              </label>
            ) : null}
            {sel.kind === "folder" ? (
              <>
                <Dropdown
                  value={sel.targetPageId}
                  options={value.pages.filter((p) => p.id !== page.id).map((p) => ({ label: p.name, value: p.id }))}
                  placeholder="Choose a page"
                  onChange={(e) => setCell({ ...sel, targetPageId: e.value })}
                  disabled={disabled}
                />
                {!disabled ? (
                  <Button
                    label={`New page "${sel.label}"`}
                    className="p-button-text p-button-sm"
                    onClick={() => {
                      const p: AacPage = { id: uuid(), name: sel.label, cells: [] };
                      onChange({ ...value, pages: [...value.pages.map((x) => (x.id === page.id ? { ...x, cells: x.cells.map((c) => (c.id === sel.id ? { ...sel, targetPageId: p.id } : c)) } : x)), p] });
                    }}
                  />
                ) : null}
              </>
            ) : null}
            <Button
              label={sel.hidden ? "Show this word again" : "Hide this word"}
              icon={sel.hidden ? "pi pi-eye" : "pi pi-eye-slash"}
              className="p-button-outlined p-button-sm"
              disabled={disabled}
              onClick={() => setCell({ ...sel, hidden: !sel.hidden })}
              tooltip="Hidden cells keep their square (so nothing moves), but the child doesn't see them yet. Bring them back when they're ready."
              tooltipOptions={{ position: "top" }}
            />
            {sel.kind === "word" ? (
              <Button
                label={sel.core ? "Unpin from every page" : "Pin to every page"}
                icon="pi pi-bookmark"
                className="p-button-outlined p-button-sm"
                disabled={disabled}
                onClick={() => (sel.core ? unpinFromCore() : pinToCore())}
                tooltip="Core cells sit in the same square on every page, so the child learns a hand path for the words they use most."
                tooltipOptions={{ position: "top" }}
              />
            ) : null}
            {!disabled ? (
              <Button
                label="Delete this button"
                icon="pi pi-trash"
                className="p-button-text p-button-danger p-button-sm"
                onClick={() => {
                  if (!window.confirm("Delete this button? If you might want it back later, Hide it instead.")) return;
                  setPage({ ...page, cells: page.cells.filter((c) => c.id !== sel.id) });
                  setSelected(null);
                }}
              />
            ) : null}
          </div>
          {sel.kind === "folder" && !sel.targetPageId ? <span className="error-text">Choose the page this folder opens.</span> : null}
          {photos.kind === "kid" ? (
            <VoiceControl kidId={photos.kidId} cell={sel} language={value.language} disabled={disabled} onChange={(audio) => setCell({ ...sel, audio })} />
          ) : (
            <span className="hint-text">Voice recordings belong to one child, so templates don't have them; add them on a child's board.</span>
          )}
        </div>
      ) : null}
      {picking && sel ? (
        <PicturePicker
          photos={photos}
          initialQuery={value.language === "en" ? sel.label : ""}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setCell({ ...sel, picture: p });
            setPicking(false);
          }}
        />
      ) : null}
    </div>
  );
}
