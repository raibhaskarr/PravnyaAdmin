import { env } from "../../config/env";
import index from "./arasaac/index.json";

// ARASAAC pictograms (CC BY-NC-SA 4.0, Gobierno de Aragón, by Sergio Palao).
// Added 2026-11-24 at the user's request; shipped alongside Mulberry so neither replaces the other.
// Ids are prefixed "arasaac:<number>" everywhere so a bare id still means Mulberry (backward compat
// for schedules, templates and children's boards that already exist).

export type Info = { id: string; label: string; grammar: string; category: string; url: string };

type Raw = [number, string[], string[], boolean];
type Entry = { id: number; label: string; words: string[]; categoryText: string; category: string; aac: boolean };
const entries: Entry[] = (index.symbols as unknown as Raw[]).map(([id, keywords, categories, aac]) => ({
  id,
  label: keywords[0],
  words: keywords,
  categoryText: categories.join(" ").toLowerCase(),
  category: categories[0] ?? "",
  aac
}));
const byId = new Map(entries.map((e) => [e.id, e]));

export const ARASAAC_PREFIX = "arasaac:";

const url = (id: number) => `${env.ARASAAC_BASE_URL}/${id}/${id}_300.png`;
const info = (e: Entry): Info => ({ id: `${ARASAAC_PREFIX}${e.id}`, label: e.label, grammar: "", category: e.category, url: url(e.id) });

/** "arasaac:6456" -> 6456, anything else -> null. */
function parse(id: string): number | null {
  if (!id.startsWith(ARASAAC_PREFIX)) return null;
  const n = Number(id.slice(ARASAAC_PREFIX.length));
  return Number.isInteger(n) ? n : null;
}

export const arasaac = {
  exists(id: string) {
    const n = parse(id);
    return n !== null && byId.has(n);
  },
  get(id: string): Info | null {
    const n = parse(id);
    const e = n !== null ? byId.get(n) : null;
    return e ? info(e) : null;
  },
  search(query: string, limit: number): Info[] {
    const q = query.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return [];
    const qWords = q.split(/[\s-]+/).filter(Boolean);
    const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
    const sWords = qWords.map(singular);
    const score = (e: Entry) => {
      if (e.words.includes(q) || e.words.includes(sWords.join(" "))) return 100 + (e.aac ? 10 : 0);
      if (e.words.some((w) => w.startsWith(q))) return 80 + (e.aac ? 10 : 0);
      if (qWords.every((w) => e.words.some((x) => x.startsWith(w)))) return 60 - e.words.length + (e.aac ? 10 : 0);
      if (qWords.every((w) => e.categoryText.includes(w))) return 30 + (e.aac ? 5 : 0);
      if (e.words.some((w) => w.includes(q))) return 20 + (e.aac ? 5 : 0);
      return 0;
    };
    return entries
      .map((e) => ({ e, s: score(e) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.e.label.length - b.e.label.length)
      .slice(0, limit)
      .map((x) => info(x.e));
  }
};
