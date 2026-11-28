import { z } from "zod";
import { pictureSchema } from "../visual-schedules/visualSchedules.schemas";

// An AAC board: a grid (rows x cols, the same on every page) and its pages. A cell is a word the
// child taps to say, or a folder that opens another page. Empty squares have no cell; a hidden
// cell keeps its square (so words never move as vocabulary grows) but isn't shown to the child.

export const WORD_CLASSES = ["pronoun", "verb", "describe", "noun", "social", "question", "misc"] as const;
export const LANGUAGES = ["en", "hi"] as const;
export const LIMITS = { minRows: 1, maxRows: 8, minCols: 1, maxCols: 10, maxPages: 40 };

const id = z.string().uuid();

/** Grammar markers the child taps after a word to transform it: eat + ed -> ate, cup + s -> cups. */
export const AFFIXES = ["ed", "ing", "s", "'s"] as const;
export type Affix = (typeof AFFIXES)[number];

export const cellSchema = z.object({
  id,
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  kind: z.enum(["word", "folder", "affix"]),
  label: z.string().trim().min(1).max(40),
  /** Spoken instead of the label, if set. */
  say: z.string().trim().max(200).nullable().default(null),
  picture: pictureSchema.default(null),
  wordClass: z.enum(WORD_CLASSES).default("misc"),
  /** For a folder: the page it opens. */
  targetPageId: id.nullable().default(null),
  /** For an affix: which grammar marker it is (ed / ing / s / 's). Null on word/folder cells. */
  affix: z.enum(AFFIXES).nullable().default(null),
  hidden: z.boolean().default(false),
  /** A recording someone made of this word (played instead of the phone's voice). */
  audio: z.object({ mediaId: z.string().uuid() }).nullable().default(null)
});
export type Cell = z.infer<typeof cellSchema>;

export const pageSchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  cells: z.array(cellSchema).max(80),
  /** Per-page grid. Undefined inherits from the board; a page can be bigger or smaller than the home. */
  rows: z.number().int().min(LIMITS.minRows).max(LIMITS.maxRows).optional(),
  cols: z.number().int().min(LIMITS.minCols).max(LIMITS.maxCols).optional()
});
export type Page = z.infer<typeof pageSchema>;

/** The grid used when rendering a page: its own rows/cols, or the board's defaults. */
export function pageGrid(page: Pick<Page, "rows" | "cols">, board: { rows: number; cols: number }) {
  return { rows: page.rows ?? board.rows, cols: page.cols ?? board.cols };
}

const boardShape = {
  name: z.string().trim().min(1).max(60),
  language: z.enum(LANGUAGES),
  rows: z.number().int().min(LIMITS.minRows).max(LIMITS.maxRows),
  cols: z.number().int().min(LIMITS.minCols).max(LIMITS.maxCols),
  homePageId: id,
  pages: z.array(pageSchema).min(1).max(LIMITS.maxPages),
  /** Cells shown in the same square on every page (Proloquo2Go-style motor plan). Default none. */
  coreCells: z.array(cellSchema).max(80).default([])
};

/** Every cell inside its page's grid, one cell per square, folders open a page that exists, the home page exists, core cells fit every page and don't collide with page cells. */
function boardRules(b: { rows: number; cols: number; homePageId: string; pages: Page[]; coreCells?: Cell[] }, ctx: z.RefinementCtx) {
  const pageIds = new Set(b.pages.map((p) => p.id));
  if (pageIds.size !== b.pages.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages"], message: "Two pages have the same id" });
  if (!pageIds.has(b.homePageId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["homePageId"], message: "The home page isn't one of the pages" });

  // Core cells have to fit the smallest page (otherwise they'd fall off its grid). Each core cell
  // uses a square once and is never a folder (a folder lives on the page it opens, not everywhere).
  const minRows = Math.min(b.rows, ...b.pages.map((p) => pageGrid(p, b).rows));
  const minCols = Math.min(b.cols, ...b.pages.map((p) => pageGrid(p, b).cols));
  const coreSquares = new Set<string>();
  (b.coreCells ?? []).forEach((c, ci) => {
    const at = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["coreCells", ci], message: `Core cell: ${message}` });
    if (c.row >= minRows || c.col >= minCols) at(`"${c.label}" doesn't fit every page's grid (smallest is ${minRows}×${minCols})`);
    const sq = `${c.row},${c.col}`;
    if (coreSquares.has(sq)) at(`two core cells in the same square`);
    coreSquares.add(sq);
    if (c.kind === "folder") at(`"${c.label}" can't be a folder (core cells appear on every page)`);
  });

  b.pages.forEach((p, pi) => {
    const { rows, cols } = pageGrid(p, b);
    const squares = new Set<string>();
    p.cells.forEach((c, ci) => {
      const at = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", pi, "cells", ci], message: `${p.name}: ${message}` });
      if (c.row >= rows || c.col >= cols) at(`"${c.label}" is outside the ${rows}×${cols} grid of this page`);
      const sq = `${c.row},${c.col}`;
      if (squares.has(sq)) at(`two buttons in the same square`);
      if (coreSquares.has(sq)) at(`"${c.label}" sits where a core cell belongs; move it to a free square or unpin the core cell`);
      squares.add(sq);
      if (c.kind === "folder" && (!c.targetPageId || !pageIds.has(c.targetPageId) || c.targetPageId === p.id)) at(`folder "${c.label}" must open another page`);
      if (c.kind === "affix" && !c.affix) at(`"${c.label}" is an affix cell but doesn't say which (ed / ing / s / 's)`);
      if (c.kind !== "affix" && c.affix) at(`"${c.label}": only affix cells carry a grammar marker`);
    });
  });
  // Same rule for the board's core strip.
  (b.coreCells ?? []).forEach((c, ci) => {
    const at = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["coreCells", ci], message: `Core cell: ${message}` });
    if (c.kind === "affix" && !c.affix) at(`"${c.label}" is an affix cell but doesn't say which (ed / ing / s / 's)`);
    if (c.kind !== "affix" && c.affix) at(`"${c.label}": only affix cells carry a grammar marker`);
  });
}

export const boardFieldsSchema = z.object(boardShape).superRefine(boardRules);
export type BoardFields = z.infer<typeof boardFieldsSchema>;

export const createBoardSchema = z.object({ kidId: id, ...boardShape }).superRefine(boardRules);
export const saveBoardSchema = z.object({ ...boardShape, version: z.number().int().min(1) }).superRefine(boardRules);
export const parentCreateBoardSchema = boardFieldsSchema;
