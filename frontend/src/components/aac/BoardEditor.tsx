import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { api, ApiError, assetUrl } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { AacBoardFields, AacCell, AacPage, AacWordClass } from "../../api/types";
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

const uuid = () => crypto.randomUUID();

/** A new board: one home page, empty. */
export function blankBoard(name: string, language: "en" | "hi", rows: number, cols: number): AacBoardFields {
  const home = uuid();
  return { name, language, rows, cols, homePageId: home, pages: [{ id: home, name: language === "hi" ? "होम" : "Home", cells: [] }] };
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
  const cellAt = (row: number, col: number) => page.cells.find((c) => c.row === row && c.col === col);
  const sel = selected ? cellAt(selected.row, selected.col) : undefined;
  const size = Math.max(64, Math.min(104, Math.floor(760 / value.cols)));

  const setPages = (pages: AacPage[], patch: Partial<AacBoardFields> = {}) => onChange({ ...value, ...patch, pages });
  const setPage = (p: AacPage) => setPages(value.pages.map((x) => (x.id === p.id ? p : x)));
  const setCell = (c: AacCell) => setPage({ ...page, cells: page.cells.some((x) => x.id === c.id) ? page.cells.map((x) => (x.id === c.id ? c : x)) : [...page.cells, c] });

  function resize(rows: number, cols: number) {
    const outside = value.pages.reduce((n, p) => n + p.cells.filter((c) => c.row >= rows || c.col >= cols).length, 0);
    if (outside && !window.confirm(`${outside} button${outside === 1 ? "" : "s"} would fall outside the smaller grid and be removed. Go ahead?`)) return;
    setSelected(null);
    onChange({ ...value, rows, cols, pages: value.pages.map((p) => ({ ...p, cells: p.cells.filter((c) => c.row < rows && c.col < cols) })) });
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
    setCell({ id: uuid(), row, col, kind: "word", label: value.language === "hi" ? "नया शब्द" : "new word", say: null, picture: null, wordClass: "misc", targetPageId: null, hidden: false, audio: null });
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
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${value.cols}, ${size}px)`, gap: 6, padding: 8, background: "#f3f4f6", borderRadius: 12, width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
        {Array.from({ length: value.rows * value.cols }, (_, i) => {
          const row = Math.floor(i / value.cols);
          const col = i % value.cols;
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
              <label className="field">
                <span className="field-label">Says (if different)</span>
                <InputText value={sel.say ?? ""} onChange={(e) => setCell({ ...sel, say: e.target.value || null })} maxLength={200} disabled={disabled} placeholder={sel.label} />
              </label>
              <label className="field">
                <span className="field-label">Word type (colour)</span>
                <Dropdown value={sel.wordClass} options={WORD_CLASSES} optionLabel="label" optionValue="value" onChange={(e) => setCell({ ...sel, wordClass: e.value })} disabled={disabled} />
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
              <Checkbox checked={sel.kind === "folder"} disabled={disabled} onChange={(e) => setCell({ ...sel, kind: e.checked ? "folder" : "word", targetPageId: e.checked ? (value.pages.find((p) => p.id !== page.id)?.id ?? null) : null })} />
              Folder (opens a page)
            </label>
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
            <label style={{ display: "flex", gap: "0.3rem", alignItems: "center" }} title="Keeps its square, so other words don't move, but the child doesn't see it yet">
              <Checkbox checked={sel.hidden} disabled={disabled} onChange={(e) => setCell({ ...sel, hidden: !!e.checked })} />
              Hidden for now
            </label>
            {!disabled ? (
              <Button
                label="Remove button"
                icon="pi pi-trash"
                className="p-button-text p-button-danger p-button-sm"
                onClick={() => {
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
