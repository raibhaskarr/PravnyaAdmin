import { env } from "../../config/env";
import index from "./mulberry.json";

// The Mulberry symbol set (CC BY-SA 4.0, Steve Lee): ~3,000 line-drawn pictures for schedules and
// AAC. Shipped since day one; cells created before ARASAAC was added use these bare ids, so this
// stays as the fallback for anything not prefixed with another set name.

export type Info = { id: string; label: string; grammar: string; category: string; url: string };

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

const url = (id: string) => `${env.SYMBOLS_BASE_URL}/${encodeURIComponent(id)}.svg`;
const info = (e: Entry): Info => ({ id: e.id, label: e.label, grammar: e.grammar, category: e.category, url: url(e.id) });

export const mulberry = {
  exists: (id: string) => byId.has(id),
  get: (id: string): Info | null => {
    const e = byId.get(id);
    return e ? info(e) : null;
  },
  search(query: string, limit: number): Info[] {
    const q = query.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return [];
    const qWords = q.split(/[\s-]+/).filter(Boolean);
    const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
    const sWords = qWords.map(singular);
    const sq = sWords.join(" ");
    const score = (e: Entry, qu: string, qw: string[]) => {
      const label = e.label.toLowerCase();
      if (label === qu) return 100;
      if (label.startsWith(qu)) return 80 - Math.min(label.length - qu.length, 20) / 2;
      if (qw.every((w) => e.words.some((x) => x.startsWith(w)))) return 60 - e.words.length;
      if (qw.every((w) => e.tags.includes(w) || e.category.toLowerCase().includes(w))) return 30;
      if (label.includes(qu)) return 20;
      return 0;
    };
    return entries
      .map((e) => ({ e, s: Math.max(score(e, q, qWords), sq !== q ? score(e, sq, sWords) - 1 : 0) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.e.label.length - b.e.label.length)
      .slice(0, limit)
      .map((x) => info(x.e));
  }
};
