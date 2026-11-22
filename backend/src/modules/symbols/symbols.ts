import { env } from "../../config/env";
import index from "./mulberry.json";

// The Mulberry symbol set (CC BY-SA 4.0, Steve Lee): ~3,000 simple pictures for schedules and AAC.
// The list (built by scripts/build-mulberry-index.ts) ships with the code; the pictures are served
// from SYMBOLS_BASE_URL.

export const SYMBOL_CREDIT = "Symbols: Mulberry Symbols by Steve Lee, CC BY-SA 4.0";

export type SymbolInfo = { id: string; label: string; grammar: string; category: string; url: string };

type Entry = { id: string; label: string; grammar: string; category: string; words: string[]; tags: string };
const entries: Entry[] = (index.symbols as string[][]).map(([id, label, grammar, category, tags]) => ({
  id,
  label,
  grammar,
  category,
  tags: tags.toLowerCase(),
  words: label.toLowerCase().split(/[\s-]+/).filter(Boolean)
}));
const byId = new Map(entries.map((e) => [e.id, e]));

export function symbolUrl(id: string) {
  return `${env.SYMBOLS_BASE_URL}/${encodeURIComponent(id)}.svg`;
}

export function symbolExists(id: string) {
  return byId.has(id);
}

const info = (e: Entry): SymbolInfo => ({ id: e.id, label: e.label, grammar: e.grammar, category: e.category, url: symbolUrl(e.id) });

export function getSymbol(id: string): SymbolInfo | null {
  const e = byId.get(id);
  return e ? info(e) : null;
}

function score(e: Entry, q: string, qWords: string[]) {
  const label = e.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80 - Math.min(label.length - q.length, 20) / 2;
  if (qWords.every((w) => e.words.some((x) => x.startsWith(w)))) return 60 - e.words.length;
  if (qWords.every((w) => e.tags.includes(w) || e.category.toLowerCase().includes(w))) return 30;
  if (label.includes(q)) return 20;
  return 0;
}

/** The best matches for a search like "brush teeth" or "toilet". */
export function searchSymbols(query: string, limit = 40): SymbolInfo[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];
  const qWords = q.split(/[\s-]+/).filter(Boolean);
  // "shoes" should also find "shoe".
  const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  const sWords = qWords.map(singular);
  const sq = sWords.join(" ");
  return entries
    .map((e) => ({ e, s: Math.max(score(e, q, qWords), sq !== q ? score(e, sq, sWords) - 1 : 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.label.length - b.e.label.length)
    .slice(0, limit)
    .map((x) => info(x.e));
}

/** The single best symbol for a word or short phrase, or null. */
export function bestSymbol(query: string): SymbolInfo | null {
  return searchSymbols(query, 1)[0] ?? null;
}
