import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError, assetUrl } from "../../api/client";
import type { SchedulePicture, SymbolResult, VisualScheduleKind, VisualScheduleStep } from "../../api/types";

// The picture schedule editor shared by a child's schedules and the schedule templates: title, kind,
// language, days, time, and the steps with their pictures (Mulberry symbols or uploaded photos).

export const KINDS: { value: VisualScheduleKind; label: string; hint: string }[] = [
  { value: "FIRST_THEN", label: "First / Then", hint: "Two pictures: the task first, then the reward." },
  { value: "ROUTINE", label: "Routine", hint: "The steps of one activity, e.g. brushing teeth (2-12 steps)." },
  { value: "DAY", label: "Day plan", hint: "What happens today, in order (2-16 steps)." }
];
export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<VisualScheduleKind, string>;
export const LANGUAGES = [
  { label: "English", value: "en" },
  { label: "Hindi", value: "hi" }
];
export const DAYS: readonly string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const SYMBOL_CREDIT = "Pictograms: ARASAAC Pictograms by Sergio Palao, CC BY-NC-SA 4.0, Government of Aragón. Symbols: Mulberry Symbols by Steve Lee, CC BY-SA 4.0.";
const MAX_STEPS: Record<VisualScheduleKind, number> = { FIRST_THEN: 2, ROUTINE: 12, DAY: 16 };

export type ScheduleFormValue = {
  title: string;
  kind: VisualScheduleKind;
  language: "en" | "hi";
  days: string[];
  time: string | null;
  steps: VisualScheduleStep[];
};

export const newStep = (label: string): VisualScheduleStep => ({ key: crypto.randomUUID(), label, say: null, picture: null, minutes: null });

export function blankSteps(kind: VisualScheduleKind, hi: boolean) {
  if (kind === "FIRST_THEN") return [newStep(hi ? "पहले" : "First"), newStep(hi ? "फिर" : "Then")];
  return [newStep(hi ? "पहला काम" : "Step 1"), newStep(hi ? "दूसरा काम" : "Step 2")];
}

export function daysText(days: string[]) {
  return days.length === 0 || days.length === 7 ? "Any day" : days.join(", ");
}

/** The API stores pictures by symbol or photo id; the link is only for showing them. */
export function toApiSteps(steps: VisualScheduleStep[]): VisualScheduleStep[] {
  return steps.map((s) => ({ ...s, picture: s.picture && (s.picture.kind === "symbol" ? { kind: "symbol", symbolId: s.picture.symbolId } : { kind: "photo", mediaId: s.picture.mediaId }) }));
}

/** Shrinks a photo to at most 1024px on its long side, as a JPEG, and returns it base64-encoded. */
async function shrinkToBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Opens a printable page of the schedule (picture cards with labels) and the print dialog. */
export function printSchedule(s: { title: string; kind: VisualScheduleKind; steps: VisualScheduleStep[] }) {
  const w = window.open("", "_blank");
  if (!w) return;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const cards = s.steps
    .map((st, i) => {
      const head = s.kind === "FIRST_THEN" ? (i === 0 ? "First" : "Then") : String(i + 1);
      const img = st.picture?.url ? `<img src="${esc(assetUrl(st.picture.url))}" alt="">` : `<div class="noimg"></div>`;
      return `<div class="card"><div class="n">${head}</div>${img}<div class="l">${esc(st.label)}</div></div>`;
    })
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.title)}</title><style>
    body{font-family:system-ui,sans-serif;margin:16px;color:#111}h1{font-size:20px;margin:0 0 12px}
    .grid{display:flex;flex-wrap:wrap;gap:12px}.card{width:${s.kind === "FIRST_THEN" ? "45%" : "170px"};border:3px solid #222;border-radius:14px;padding:10px;text-align:center;break-inside:avoid}
    .card img,.noimg{width:100%;aspect-ratio:1;object-fit:contain}.n{font-weight:700;font-size:14px;text-align:left}.l{font-size:22px;font-weight:700;margin-top:6px}
    .credit{margin-top:16px;font-size:10px;color:#666}</style></head><body><h1>${esc(s.title)}</h1><div class="grid">${cards}</div>
    <div class="credit">${SYMBOL_CREDIT}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  w.document.close();
}

export function Thumb({ picture, size = 64 }: { picture: SchedulePicture | null; size?: number }) {
  // Photo links expire after about an hour; a page left open longer needs a reload to show them.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (picture?.url && failedUrl === picture.url) {
    return (
      <div title="Reload the page to show this photo again" style={{ width: size, height: size, borderRadius: 8, border: "1px dashed #bbb", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 10, textAlign: "center" }}>
        Reload to show
      </div>
    );
  }
  return picture?.url ? (
    <img src={assetUrl(picture.url)} alt="" onError={() => setFailedUrl(picture.url ?? null)} style={{ width: size, height: size, objectFit: "contain", borderRadius: 8, background: "#fff", border: "1px solid var(--border, #ddd)" }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: 8, border: "1px dashed #bbb", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 11 }}>No picture</div>
  );
}

/** Pictures in a row, for a closed card. */
export function StepStrip({ steps }: { steps: VisualScheduleStep[] }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      {steps.map((s) => (
        <div key={s.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 76, fontSize: 12, textAlign: "center" }}>
          <Thumb picture={s.picture} />
          {s.label}
        </div>
      ))}
    </div>
  );
}

/**
 * Photos: "kid" uploads a photo for that child; "centre" a centre-wide one (for templates);
 * "none" offers symbols only (Pravnya's templates).
 */
export type PhotoTarget = { kind: "kid"; kidId: string } | { kind: "centre" } | { kind: "none" };

export function PicturePicker({ photos, initialQuery, onPick, onClose }: { photos: PhotoTarget; initialQuery: string; onPick: (p: SchedulePicture | null) => void; onClose: () => void }) {
  const { token } = useAuth();
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) return setResults([]);
    const t = setTimeout(() => {
      api.searchSymbols(token!, query).then((r) => setResults(r.symbols)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, token]);

  async function upload(file: File) {
    setError("");
    setBusy(true);
    try {
      const base64 = await shrinkToBase64(file);
      const { id, url } = await api.uploadPicture(token!, photos.kind === "kid" ? { kidId: photos.kidId, base64 } : { base64 });
      onPick({ kind: "photo", mediaId: id, url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog header="Choose a picture" visible onHide={onClose} style={{ width: "min(720px, 95vw)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <InputText value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pictures in English, e.g. brush teeth" style={{ flex: 1, minWidth: 220 }} autoFocus />
          {photos.kind !== "none" ? <Button label="Upload a photo" icon="pi pi-upload" className="p-button-outlined" loading={busy} onClick={() => fileRef.current?.click()} /> : null}
          <Button label="No picture" className="p-button-text" onClick={() => onPick(null)} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <span className="hint-text">
          {photos.kind === "kid"
            ? "A photo of the child's own things (their toothbrush, their school) often works best. Photos are only shown to this child's team and family."
            : photos.kind === "centre"
              ? "A centre photo (your room, your hello song) is shared with every child this template is used for. Don't use photos of children here."
              : "Pravnya's templates use symbols only; therapists and parents can swap in their own photos."}
        </span>
        {error ? <p className="error-text">{error}</p> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: "0.5rem", maxHeight: 380, overflowY: "auto" }}>
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick({ kind: "symbol", symbolId: s.id, url: s.url })}
              style={{ border: "1px solid #ddd", borderRadius: 10, background: "#fff", padding: 6, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
            >
              <img src={s.url} alt="" loading="lazy" style={{ width: 72, height: 72, objectFit: "contain" }} />
              <span style={{ fontSize: 12, color: "#333" }}>{s.label}</span>
            </button>
          ))}
          {q.trim() && results.length === 0 ? <span className="hint-text">No pictures found. Try a simpler word.</span> : null}
        </div>
        <span className="hint-text" style={{ fontSize: 11 }}>{SYMBOL_CREDIT}</span>
      </div>
    </Dialog>
  );
}

function StepRow({
  step,
  index,
  count,
  disabled,
  head,
  onChange,
  onMove,
  onRemove,
  onPickPicture
}: {
  step: VisualScheduleStep;
  index: number;
  count: number;
  disabled: boolean;
  head: string;
  onChange: (s: VisualScheduleStep) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: (() => void) | null;
  onPickPicture: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", padding: "0.4rem 0", borderTop: index ? "1px solid #eee" : undefined }}>
      <strong style={{ width: 44 }}>{head}</strong>
      <button type="button" onClick={onPickPicture} disabled={disabled} style={{ border: 0, padding: 0, background: "none", cursor: disabled ? "default" : "pointer" }} aria-label={`Picture for ${step.label}`}>
        <Thumb picture={step.picture} />
      </button>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1, minWidth: 220 }}>
        <InputText value={step.label} onChange={(e) => onChange({ ...step, label: e.target.value })} placeholder="Label (1-3 words)" maxLength={60} disabled={disabled} />
        <InputText value={step.say ?? ""} onChange={(e) => onChange({ ...step, say: e.target.value || null })} placeholder="Read aloud instead (optional)" maxLength={200} disabled={disabled} />
      </div>
      <label style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
        Timer (min)
        <InputNumber value={step.minutes} onValueChange={(e) => onChange({ ...step, minutes: e.value ?? null })} min={1} max={120} inputStyle={{ width: 70 }} disabled={disabled} />
      </label>
      {!disabled ? (
        <div style={{ display: "flex" }}>
          <Button icon="pi pi-arrow-up" className="p-button-text p-button-sm" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)} />
          <Button icon="pi pi-arrow-down" className="p-button-text p-button-sm" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)} />
          {onRemove ? <Button icon="pi pi-trash" className="p-button-text p-button-danger p-button-sm" aria-label="Remove step" onClick={onRemove} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The fields of a schedule or template. Controlled: the caller keeps the value and saves it. */
export function ScheduleForm({
  value,
  onChange,
  disabled,
  photos,
  timeHint,
  extra
}: {
  value: ScheduleFormValue;
  onChange: (v: ScheduleFormValue) => void;
  disabled: boolean;
  photos: PhotoTarget;
  timeHint: string;
  /** More fields, shown next to the time (e.g. the reminder switch). */
  extra?: React.ReactNode;
}) {
  const [picking, setPicking] = useState<number | null>(null);
  const v = value;
  const set = (patch: Partial<ScheduleFormValue>) => onChange({ ...v, ...patch });
  const setStep = (i: number, s: VisualScheduleStep) => set({ steps: v.steps.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...v.steps];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    set({ steps: next });
  };
  const head = (i: number) => (v.kind === "FIRST_THEN" ? (i === 0 ? "First" : "Then") : `${i + 1}.`);

  return (
    <>
      <div className="field-grid">
        <label className="field">
          <span className="field-label">Title</span>
          <InputText value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} disabled={disabled} />
        </label>
        <label className="field">
          <span className="field-label">Kind</span>
          <Dropdown value={v.kind} options={KINDS} optionLabel="label" optionValue="value" onChange={(e) => set({ kind: e.value })} disabled={disabled} />
        </label>
        <label className="field">
          <span className="field-label">Read aloud in</span>
          <Dropdown value={v.language} options={LANGUAGES} onChange={(e) => set({ language: e.value })} disabled={disabled} />
        </label>
      </div>
      <div className="field">
        <span className="field-label">Days (none ticked = any day)</span>
        <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
          {DAYS.map((d) => (
            <label key={d} style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
              <Checkbox checked={v.days.includes(d)} disabled={disabled} onChange={(e) => set({ days: e.checked ? DAYS.filter((x) => x === d || v.days.includes(x)) : v.days.filter((x) => x !== d) })} />
              {d}
            </label>
          ))}
        </div>
      </div>
      <div className="field-grid">
        <label className="field">
          <span className="field-label">Usual time (optional)</span>
          <input type="time" className="input" value={v.time ?? ""} onChange={(e) => set({ time: e.target.value || null })} disabled={disabled} />
          <span className="hint-text">{timeHint}</span>
        </label>
        {extra}
      </div>
      <div className="field">
        <span className="field-label">Steps</span>
        <span className="hint-text">{KINDS.find((k) => k.value === v.kind)?.hint} Click a picture to change it.</span>
        {v.steps.map((s, i) => (
          <StepRow
            key={s.key}
            step={s}
            index={i}
            count={v.steps.length}
            head={head(i)}
            disabled={disabled}
            onChange={(x) => setStep(i, x)}
            onMove={(dir) => move(i, dir)}
            onRemove={v.steps.length > 2 ? () => set({ steps: v.steps.filter((_, j) => j !== i) }) : null}
            onPickPicture={() => setPicking(i)}
          />
        ))}
        {!disabled && v.steps.length < MAX_STEPS[v.kind] ? (
          <Button label="Add a step" icon="pi pi-plus" className="p-button-text p-button-sm" style={{ alignSelf: "flex-start" }} onClick={() => set({ steps: [...v.steps, newStep("")] })} />
        ) : null}
        {v.kind === "FIRST_THEN" && v.steps.length !== 2 ? <span className="error-text">First / Then needs exactly 2 steps.</span> : null}
      </div>
      {picking !== null ? (
        <PicturePicker
          photos={photos}
          initialQuery={v.language === "en" ? v.steps[picking].label : ""}
          onClose={() => setPicking(null)}
          onPick={(p) => {
            setStep(picking, { ...v.steps[picking], picture: p });
            setPicking(null);
          }}
        />
      ) : null}
    </>
  );
}
