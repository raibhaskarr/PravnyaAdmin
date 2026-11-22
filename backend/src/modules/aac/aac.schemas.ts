import { z } from "zod";
import { pictureSchema } from "../visual-schedules/visualSchedules.schemas";

// An AAC board: a grid (rows x cols, the same on every page) and its pages. A cell is a word the
// child taps to say, or a folder that opens another page. Empty squares have no cell; a hidden
// cell keeps its square (so words never move as vocabulary grows) but isn't shown to the child.

export const WORD_CLASSES = ["pronoun", "verb", "describe", "noun", "social", "question", "misc"] as const;
export const LANGUAGES = ["en", "hi"] as const;
export const LIMITS = { minRows: 1, maxRows: 8, minCols: 1, maxCols: 10, maxPages: 40 };

const id = z.string().uuid();

export const cellSchema = z.object({
  id,
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  kind: z.enum(["word", "folder"]),
  label: z.string().trim().min(1).max(40),
  /** Spoken instead of the label, if set. */
  say: z.string().trim().max(200).nullable().default(null),
  picture: pictureSchema.default(null),
  wordClass: z.enum(WORD_CLASSES).default("misc"),
  /** For a folder: the page it opens. */
  targetPageId: id.nullable().default(null),
  hidden: z.boolean().default(false),
  /** A recording someone made of this word (played instead of the phone's voice). */
  audio: z.object({ mediaId: z.string().uuid() }).nullable().default(null)
});
export type Cell = z.infer<typeof cellSchema>;

export const pageSchema = z.object({ id, name: z.string().trim().min(1).max(40), cells: z.array(cellSchema).max(80) });
export type Page = z.infer<typeof pageSchema>;

const boardShape = {
  name: z.string().trim().min(1).max(60),
  language: z.enum(LANGUAGES),
  rows: z.number().int().min(LIMITS.minRows).max(LIMITS.maxRows),
  cols: z.number().int().min(LIMITS.minCols).max(LIMITS.maxCols),
  homePageId: id,
  pages: z.array(pageSchema).min(1).max(LIMITS.maxPages)
};

/** Every cell inside the grid, one cell per square, folders open a page that exists, the home page exists. */
function boardRules(b: { rows: number; cols: number; homePageId: string; pages: Page[] }, ctx: z.RefinementCtx) {
  const pageIds = new Set(b.pages.map((p) => p.id));
  if (pageIds.size !== b.pages.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages"], message: "Two pages have the same id" });
  if (!pageIds.has(b.homePageId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["homePageId"], message: "The home page isn't one of the pages" });
  b.pages.forEach((p, pi) => {
    const squares = new Set<string>();
    p.cells.forEach((c, ci) => {
      const at = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", pi, "cells", ci], message: `${p.name}: ${message}` });
      if (c.row >= b.rows || c.col >= b.cols) at(`"${c.label}" is outside the grid`);
      const sq = `${c.row},${c.col}`;
      if (squares.has(sq)) at(`two buttons in the same square`);
      squares.add(sq);
      if (c.kind === "folder" && (!c.targetPageId || !pageIds.has(c.targetPageId) || c.targetPageId === p.id)) at(`folder "${c.label}" must open another page`);
    });
  });
}

export const boardFieldsSchema = z.object(boardShape).superRefine(boardRules);
export type BoardFields = z.infer<typeof boardFieldsSchema>;

export const createBoardSchema = z.object({ kidId: id, ...boardShape }).superRefine(boardRules);
export const saveBoardSchema = z.object({ ...boardShape, version: z.number().int().min(1) }).superRefine(boardRules);
export const parentCreateBoardSchema = boardFieldsSchema;
