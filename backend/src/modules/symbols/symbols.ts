import { mulberry, type Info as MulberryInfo } from "./mulberry";
import { arasaac, ARASAAC_PREFIX } from "./arasaac";

// Pravnya ships two symbol sets side-by-side: Mulberry (CC BY-SA 4.0, bare ids) and ARASAAC
// (CC BY-NC-SA 4.0, ids prefixed "arasaac:"). The picker shows ARASAAC first and falls back to
// Mulberry for anything ARASAAC doesn't have. Bare ids are always Mulberry, so every schedule and
// AAC board made before ARASAAC was added still works unchanged.

export type SymbolInfo = MulberryInfo;

export const SYMBOL_CREDITS = {
  arasaac: "Pictograms: ARASAAC Pictograms by Sergio Palao, CC BY-NC-SA 4.0, Government of Aragón.",
  mulberry: "Symbols: Mulberry Symbols by Steve Lee, CC BY-SA 4.0."
};
/** Joined credit shown on a page that uses either set. */
export const SYMBOL_CREDIT = `${SYMBOL_CREDITS.arasaac} ${SYMBOL_CREDITS.mulberry}`;

export function symbolExists(id: string): boolean {
  if (id.startsWith(ARASAAC_PREFIX)) return arasaac.exists(id);
  return mulberry.exists(id);
}

export function symbolUrl(id: string): string {
  if (id.startsWith(ARASAAC_PREFIX)) return arasaac.get(id)?.url ?? "";
  return mulberry.get(id)?.url ?? "";
}

export function getSymbol(id: string): SymbolInfo | null {
  if (id.startsWith(ARASAAC_PREFIX)) return arasaac.get(id);
  return mulberry.get(id);
}

/** Search both sets. ARASAAC results come first, then Mulberry fills the rest up to `limit`. */
export function searchSymbols(query: string, limit = 40): SymbolInfo[] {
  const half = Math.ceil(limit / 2);
  const ar = arasaac.search(query, Math.max(half, limit));
  const mb = mulberry.search(query, limit);
  const seen = new Set<string>();
  const merged: SymbolInfo[] = [];
  for (const s of ar) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    merged.push(s);
    if (merged.length >= limit) return merged;
  }
  for (const s of mb) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    merged.push(s);
    if (merged.length >= limit) break;
  }
  return merged;
}

/** The single best match -- prefers ARASAAC. */
export function bestSymbol(query: string): SymbolInfo | null {
  return searchSymbols(query, 1)[0] ?? null;
}
