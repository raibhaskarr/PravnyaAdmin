import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { badRequest, notFound } from "../../common/errors/AppError";
import type { AuthUser } from "../../common/middleware/auth";
import type { Page } from "./aac.schemas";

// Usage stats for a child's AAC board. Light-weight: each tap is a row in AacCellTap. Therapists see
// the detail (per-word counts, quiet days, pages never opened). Parents see a weekly summary and a
// small list of what their child "said" this week.

const DAY_MS = 24 * 60 * 60_000;
const INDIA_OFFSET_MIN = 330;

/** 00:00 IST for the start of "N days ago", returned as a UTC Date. */
function daysAgoIndia(n: number, now = new Date()) {
  const todayStart = new Date(now.getTime() + INDIA_OFFSET_MIN * 60_000);
  todayStart.setUTCHours(0, 0, 0, 0);
  const istMidnight = todayStart.getTime() - INDIA_OFFSET_MIN * 60_000;
  return new Date(istMidnight - n * DAY_MS);
}

/** YYYY-MM-DD in India time. */
function istDate(d: Date) {
  return new Date(d.getTime() + INDIA_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export type TapInput = { cellId: string; pageId: string; label: string; wordClass: string; kind: "word" | "folder"; at?: string };
const WORD_CLASSES = new Set(["pronoun", "verb", "describe", "noun", "social", "question", "misc"]);

/** The parent app batches taps and posts them; the server trims to the ones that match the current board (so the log doesn't carry taps of a long-deleted cell). */
async function record(boardId: string, kidId: string, taps: TapInput[]) {
  if (!taps.length) return { saved: 0 };
  const board = await prisma.aacBoard.findUnique({ where: { id: boardId }, select: { kidId: true, pages: true } });
  if (!board || board.kidId !== kidId) throw notFound("Board not found");
  const pages = board.pages as unknown as Page[];
  const cellToPage = new Map<string, string>();
  for (const p of pages) for (const c of p.cells) cellToPage.set(c.id, p.id);
  // Keep only taps whose cell still belongs to this board, cap each batch at 300.
  const rows: Prisma.AacCellTapCreateManyInput[] = [];
  for (const t of taps.slice(0, 300)) {
    const pageId = cellToPage.get(t.cellId);
    if (!pageId) continue;
    const at = t.at ? new Date(t.at) : new Date();
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60_000 || at.getTime() < Date.now() - 48 * 60 * 60_000) continue;
    rows.push({
      boardId, kidId,
      cellId: t.cellId, pageId,
      label: t.label.slice(0, 40),
      wordClass: WORD_CLASSES.has(t.wordClass) ? t.wordClass : "misc",
      kind: t.kind === "folder" ? "folder" : "word",
      at
    });
  }
  if (!rows.length) return { saved: 0 };
  const result = await prisma.aacCellTap.createMany({ data: rows });
  return { saved: result.count };
}

export type Stats = {
  /** Days in the window (default 28), each with the day's word-tap count (folders excluded). */
  perDay: { date: string; words: number }[];
  /** Top words said, with the latest time each was tapped. */
  topWords: { label: string; count: number; lastAt: string }[];
  /** Hour of day (0-23) -> tap count, summed over the window. */
  byHour: number[];
  /** Pages the child hasn't opened in the window. */
  quietPages: { pageId: string; name: string }[];
  /** Cells the child has never tapped (ever). Capped at 20. */
  neverTapped: { cellId: string; pageId: string; pageName: string; label: string }[];
  /** Total word-taps and days with a tap in the window. */
  totals: { words: number; activeDays: number; windowDays: number };
};

async function computeStats(boardId: string, kidId: string, windowDays: number, now = new Date()): Promise<Stats> {
  const from = daysAgoIndia(windowDays - 1, now);
  const board = await prisma.aacBoard.findUnique({ where: { id: boardId }, select: { kidId: true, pages: true } });
  if (!board || board.kidId !== kidId) throw notFound("Board not found");
  const pages = board.pages as unknown as Page[];
  const pageName = new Map(pages.map((p) => [p.id, p.name]));
  const allCells = pages.flatMap((p) => p.cells.map((c) => ({ cellId: c.id, pageId: p.id, label: c.label, pageName: p.name })));

  const taps = await prisma.aacCellTap.findMany({ where: { kidId, at: { gte: from } }, select: { label: true, wordClass: true, kind: true, pageId: true, cellId: true, at: true } });
  // Per-day buckets.
  const perDayMap = new Map<string, number>();
  for (let n = windowDays - 1; n >= 0; n--) perDayMap.set(istDate(daysAgoIndia(n, now)), 0);
  const byHour = new Array(24).fill(0);
  const wordCounts = new Map<string, { count: number; lastAt: Date }>();
  const pagesSeen = new Set<string>();
  for (const t of taps) {
    pagesSeen.add(t.pageId);
    if (t.kind !== "word") continue;
    const date = istDate(t.at);
    perDayMap.set(date, (perDayMap.get(date) ?? 0) + 1);
    byHour[new Date(t.at.getTime() + INDIA_OFFSET_MIN * 60_000).getUTCHours()]++;
    const prev = wordCounts.get(t.label);
    if (!prev || t.at > prev.lastAt) wordCounts.set(t.label, { count: (prev?.count ?? 0) + 1, lastAt: t.at });
    else prev.count++;
  }
  const perDay = [...perDayMap].map(([date, words]) => ({ date, words }));
  const topWords = [...wordCounts].map(([label, v]) => ({ label, count: v.count, lastAt: v.lastAt.toISOString() })).sort((a, b) => b.count - a.count).slice(0, 20);
  const quietPages = pages.filter((p) => !pagesSeen.has(p.id)).map((p) => ({ pageId: p.id, name: p.name }));

  // "Never tapped" is an all-time check, not windowed -- the cell might just be new.
  const everTapped = new Set((await prisma.aacCellTap.findMany({ where: { kidId }, select: { cellId: true }, distinct: ["cellId"] })).map((t) => t.cellId));
  const neverTapped = allCells.filter((c) => !everTapped.has(c.cellId)).slice(0, 20);

  const totals = {
    words: perDay.reduce((n, d) => n + d.words, 0),
    activeDays: perDay.filter((d) => d.words > 0).length,
    windowDays
  };
  return { perDay, topWords, byHour, quietPages: quietPages.slice(0, 10), neverTapped: neverTapped.map((c) => ({ cellId: c.cellId, pageId: c.pageId, pageName: pageName.get(c.pageId) ?? "", label: c.label })), totals };
}

export const aacStatsService = {
  /** Staff: full stats for a child's board. */
  async forStaff(user: AuthUser, kidId: string, windowDays = 28) {
    await assertCanAccessKid(user, kidId);
    if (windowDays < 1 || windowDays > 90) throw badRequest("Window must be 1-90 days");
    const board = await prisma.aacBoard.findUnique({ where: { kidId }, select: { id: true } });
    if (!board) return null;
    return computeStats(board.id, kidId, windowDays);
  },

  /** Parent: a weekly summary (last 7 days) and the top 10 words. */
  async summaryForParent(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    const board = await prisma.aacBoard.findUnique({ where: { kidId }, select: { id: true } });
    if (!board) return null;
    const s = await computeStats(board.id, kidId, 7);
    return { perDay: s.perDay, totals: s.totals, topWords: s.topWords.slice(0, 10) };
  },

  /** Parent: log taps. Rate-limited loosely by the schema (max 300 per call); the client flushes every 20s. */
  async recordForParent(parentId: string, kidId: string, taps: TapInput[]) {
    await assertOwnsKid(parentId, kidId);
    const board = await prisma.aacBoard.findUnique({ where: { kidId }, select: { id: true } });
    if (!board) throw notFound("No AAC board yet");
    return record(board.id, kidId, taps);
  }
};
