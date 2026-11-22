// Builds src/modules/symbols/mulberry.json, the searchable list of Mulberry symbols, from a checkout
// of https://github.com/mulberrysymbols/mulberry-symbols (CC BY-SA 4.0, Steve Lee).
//
//   git clone --depth 1 https://github.com/mulberrysymbols/mulberry-symbols.git /some/dir
//   npx tsx scripts/build-mulberry-index.ts /some/dir <commit sha>
//
// The pictures themselves are not copied: they're served from SYMBOLS_BASE_URL (by default the
// same commit on jsDelivr), so remember to update that default when you pin a new commit.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";

const [dir, commit] = process.argv.slice(2);
if (!dir || !commit) throw new Error("usage: build-mulberry-index.ts <checkout dir> <commit sha>");

// Flags and maps of every country aren't useful to a child's schedule or board; "rated" ones are adult content.
const SKIP_CATEGORIES = new Set(["Country Flags", "Country Maps"]);

type Row = { symbol: string; grammar: string; category: string; rated: string; tags: string };
const rows = parse(readFileSync(join(dir, "scripts/data/symbol-info-en.csv")), { columns: true, skip_empty_lines: true }) as Row[];

/** "brush_teeth_,_to" -> "brush teeth", "shoe_-_ladies" -> "shoe - ladies". */
export function labelOf(id: string) {
  return id.replace(/_,_to$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

const symbols = rows
  .filter((r) => r.rated === "0" && !SKIP_CATEGORIES.has(r.category) && existsSync(join(dir, "EN", `${r.symbol}.svg`)))
  .map((r) => [r.symbol, labelOf(r.symbol), r.grammar, r.category, r.tags.trim()]);

writeFileSync(
  join(__dirname, "../src/modules/symbols/mulberry.json"),
  JSON.stringify({ source: "Mulberry Symbols by Steve Lee, CC BY-SA 4.0, https://mulberrysymbols.org", commit, fields: ["id", "label", "grammar", "category", "tags"], symbols })
);
console.log(`${symbols.length} symbols written`);
