import { assetUrl, type AacBoard, type AacCell, type AacWordClass } from "../api/client";

// Shared by the talking board (child) and the board editor (parent).

/** The usual AAC colour code: the colour tells the word's type. */
export const WORD_CLASSES: { value: AacWordClass; label: string; bg: string; border: string }[] = [
  { value: "pronoun", label: "People", bg: "#fff6bf", border: "#d6b600" },
  { value: "verb", label: "Actions", bg: "#d8f3d0", border: "#3c9a32" },
  { value: "describe", label: "Describing", bg: "#d6e7ff", border: "#3d7ad6" },
  { value: "noun", label: "Things", bg: "#ffe4c2", border: "#e08a1e" },
  { value: "social", label: "Social", bg: "#ffd9ec", border: "#d4508c" },
  { value: "question", label: "Questions", bg: "#ece0ff", border: "#8457d6" },
  { value: "misc", label: "Other", bg: "#ffffff", border: "#b9b9b9" }
];
export const COLOUR = Object.fromEntries(WORD_CLASSES.map((w) => [w.value, w])) as Record<AacWordClass, (typeof WORD_CLASSES)[number]>;

/** One button: picture, label, colour; a folder has a folder tab. */
export function CellFace({ cell, dim = false }: { cell: AacCell; dim?: boolean }) {
  const c = COLOUR[cell.wordClass];
  return (
    <span
      className="relative flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden p-1"
      style={{ background: c.bg, border: `3px solid ${c.border}`, borderRadius: cell.kind === "folder" ? "6px 18px 6px 6px" : 12, opacity: dim ? 0.35 : 1 }}
    >
      {cell.picture ? <img src={assetUrl(cell.picture.url)} alt="" className="min-h-0 w-[70%] flex-1 object-contain" draggable={false} /> : null}
      <span className="max-w-full truncate text-center text-[clamp(0.7rem,2.6vw,1.05rem)] font-bold leading-tight text-[#1d1d1d]">{cell.label}</span>
      {cell.kind === "folder" ? <span className="absolute right-1 top-0.5 text-[0.7rem]">📁</span> : null}
    </span>
  );
}

// The board is kept on the phone too, so it opens without a connection (a child's voice can't
// depend on the network). Pictures are kept by the service worker (sw.js).
const key = (kidId: string) => `pv-aac-board-${kidId}`;

export function saveBoardOffline(kidId: string, board: AacBoard | null) {
  try {
    if (board) localStorage.setItem(key(kidId), JSON.stringify(board));
    else localStorage.removeItem(key(kidId));
  } catch {
    // Storage full or blocked: the board just won't open offline.
  }
}

export function loadBoardOffline(kidId: string): AacBoard | null {
  try {
    const raw = localStorage.getItem(key(kidId));
    return raw ? (JSON.parse(raw) as AacBoard) : null;
  } catch {
    return null;
  }
}
