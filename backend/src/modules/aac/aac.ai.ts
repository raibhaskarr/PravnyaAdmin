import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createExecutionContext } from "@pravnix/ai-core";
import type { AiContentPart } from "@pravnix/ai-core";
import { orchestrator } from "../ai/ai.platform";
import { prisma } from "../../config/prisma";
import { objectStorage } from "../../common/storage/objectStorage";
import { bestSymbol, searchSymbols, symbolExists } from "../symbols/symbols";
import { WORD_CLASSES, type Cell, type Page } from "./aac.schemas";

// Draft an AAC board from a free-text brief and a few photos. Everything here is a draft the
// therapist or parent reviews, edits and saves through the normal update path -- we don't save a
// board here. Photos must belong to the kid (or be centre-wide); the AI only sees ones we hand it.

type Language = "en" | "hi";
export type DraftInput = {
  kidId: string;
  kidName: string;
  tenantId: string;
  brief: string;
  language: Language;
  photos: { mediaId: string }[];
};

const PROMPT =
  "You are a paediatric speech-language therapist building an AAC (Augmentative and Alternative Communication) board " +
  "for an autistic or developmentally delayed child. A parent or therapist describes what they want and attaches a few " +
  "photos of things the child knows (objects, foods, family). Build a board the child can start using today.\n\n" +
  "Rules, always:\n" +
  "- Pick ONE grid: 2x3, 3x3, 3x4 or 4x4 (rows x cols). Keep it small when in doubt; crowded boards lose non-verbal children.\n" +
  "- On EVERY page, pin \"more\" in the top-right square and \"all done\" in the square to its left (same place every time; the child finds them by habit).\n" +
  "- One page (\"home\") is a must. Add 1-2 sub-pages only if the brief clearly needs them; folder cells open them.\n" +
  "- Each cell is a WORD the child will tap: 1-3 short words max, no punctuation.\n" +
  "- Order of words on a page: pronouns first (I, you), then verbs (want, go, help), then describing words (more, stop, big), then nouns (ball, milk).\n" +
  "- Each cell has a wordClass from: pronoun, verb, describe, noun, social, question, misc.\n" +
  "- picture: for each cell, EITHER a symbol (`{ \"symbolId\": \"<id from the ALLOWED SYMBOLS list below>\" }`) " +
  "OR a photo (`{ \"photoIndex\": <0-based index into the attached photos>` -- the first photo is 0, the next 1, and so on), OR null if neither fits. " +
  "Use a photo for anything personal you can see in the brief or the pictures (the child's own cup, a family member, a favourite toy). Use a symbol otherwise. NEVER invent a symbolId.\n" +
  "- Folder cells: `kind: \"folder\"`, `targetPage` is the sub-page's key (lowercase slug like \"food\" or \"play\"). The home page may use folders; sub-pages must not.\n" +
  "- Words you don't have a symbol or photo for are still OK with picture null; they show as a coloured word.\n" +
  "- Hindi (`hi`): write label and say in everyday Hindi (Devanagari). English otherwise.\n\n" +
  'Return ONLY JSON of this shape (no prose, no fences): {\n' +
  '  "name": string,\n' +
  '  "rows": 2 | 3 | 4, "cols": 2 | 3 | 4,\n' +
  '  "pages": [{\n' +
  '    "key": string, "name": string,\n' +
  '    "cells": [{ "row": int, "col": int, "label": string, "say": string | null, "wordClass": string,\n' +
  '      "kind": "word" | "folder", "targetPage": string | null,\n' +
  '      "picture": { "symbolId": string } | { "photoIndex": int } | null }]\n' +
  '  }]\n' +
  '}';

function languageLine(language: Language) {
  return language === "hi"
    ? "Write labels and 'say' in simple everyday Hindi (Devanagari)."
    : "Write labels and 'say' in simple Indian English.";
}

/** Short list of symbol ids relevant to the brief, so the model picks from real ones. */
export function symbolHints(brief: string, limit = 80) {
  // Split brief into words, search for each; de-duplicate, keep top-N.
  const terms = [...new Set(brief.toLowerCase().split(/[^a-zऀ-ॿ]+/).filter((w) => w.length >= 2))].slice(0, 30);
  const common = ["more", "finish", "help_,_to", "stop", "want_,_to", "go_,_to", "eat_,_to", "drink_,_to", "play_,_to", "I", "you", "hug_,_to"];
  const ids = new Set<string>(common.filter(symbolExists));
  for (const term of terms) for (const s of searchSymbols(term, 6)) ids.add(s.id);
  // Fallback a generic set for the first draft if the brief is short.
  if (ids.size < 24) for (const q of ["food", "toy", "ball", "car", "book", "water", "milk", "happy", "sad", "angry", "home", "school"]) {
    const best = bestSymbol(q);
    if (best) ids.add(best.id);
  }
  return [...ids].slice(0, limit);
}

async function photoParts(photos: { mediaId: string }[], kidId: string, tenantId: string): Promise<{ parts: AiContentPart[]; order: string[] }> {
  const parts: AiContentPart[] = [];
  const order: string[] = [];
  if (!photos.length) return { parts, order };
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: photos.map((p) => p.mediaId) } } });
  const byId = new Map(assets.map((a) => [a.id, a]));
  for (const p of photos) {
    const a = byId.get(p.mediaId);
    // The photo belongs to this child (or is a centre asset for the same centre). Anything else is dropped silently.
    if (!a || a.tenantId !== tenantId || (a.kidId && a.kidId !== kidId)) continue;
    const body = await objectStorage.get(a.storageKey);
    if (!body) continue;
    parts.push({ type: "image", mimeType: a.mimeType, data: { base64: body.toString("base64") } });
    order.push(a.id);
  }
  return { parts, order };
}

function draftSchema() {
  // Keep the shape loose: unknown symbol ids or out-of-range photoIndexes become `picture: null` in the resolver below
  // (any strict refusal would throw away a whole draft because of one bad cell).
  const pictureSchema = z
    .union([
      z.object({ symbolId: z.string() }),
      z.object({ photoIndex: z.number().int().min(0) }),
      z.null()
    ])
    .nullable();
  const cell = z.object({
    row: z.number().int().min(0).max(7),
    col: z.number().int().min(0).max(9),
    label: z.string().trim().min(1).max(40),
    say: z.string().trim().max(200).nullable().default(null),
    wordClass: z.enum(WORD_CLASSES),
    kind: z.enum(["word", "folder"]),
    targetPage: z.string().trim().min(1).max(40).nullable().default(null),
    picture: pictureSchema.default(null)
  });
  const page = z.object({
    key: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(40),
    cells: z.array(cell).min(1).max(40)
  });
  return z.object({
    name: z.string().trim().min(1).max(60),
    rows: z.number().int().min(2).max(4),
    cols: z.number().int().min(2).max(4),
    pages: z.array(page).min(1).max(4)
  });
}

export type DraftBoard = {
  name: string;
  rows: number;
  cols: number;
  homePageId: string;
  pages: Page[];
  /** Photos the AI actually placed somewhere (in order), so the UI can show which were used. */
  photosUsed: string[];
};

export async function draftBoardWithAi(input: DraftInput): Promise<DraftBoard | null> {
  const hints = symbolHints(input.brief);
  const { parts: photoParts_, order: photoIds } = await photoParts(input.photos, input.kidId, input.tenantId);
  const situation = { childFirstName: input.kidName, language: input.language, brief: input.brief, allowedSymbols: hints, photoCount: photoIds.length };
  const content: AiContentPart[] = [{ type: "text", text: `${languageLine(input.language)}\n\n${JSON.stringify(situation, null, 1)}` }, ...photoParts_];

  const schema = draftSchema();
  const result = await orchestrator.executeStructured({
    name: "pravnyaadmin.aac-board-draft",
    // Claude handles images, Gemini also; the orchestrator picks its default.
    request: {
      systemPrompt: PROMPT,
      messages: [{ role: "user", content }],
      executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId: input.tenantId, featureId: "aac-board-draft" })
    },
    schema,
    maxRepairAttempts: 1
  });
  if (!result.success) return null;

  // Turn the AI's draft into the shape our board editor saves: UUID ids for pages and cells,
  // folder.targetPageId resolved against the generated page ids, photoIndex resolved to mediaId.
  const draft = result.value;
  const pageIds = new Map(draft.pages.map((p) => [p.key, randomUUID()]));
  const usedPhotos = new Set<string>();
  const pages: Page[] = draft.pages.map((p) => {
    const used = new Set<string>();
    const cells: Cell[] = [];
    for (const c of p.cells) {
      if (c.row >= draft.rows || c.col >= draft.cols) continue; // dropped silently
      const sq = `${c.row},${c.col}`;
      if (used.has(sq)) continue;
      used.add(sq);
      const isFolder = c.kind === "folder" && c.targetPage && pageIds.has(c.targetPage) && c.targetPage !== p.key;
      let picture: Cell["picture"] = null;
      if (c.picture && "symbolId" in c.picture && symbolExists(c.picture.symbolId)) picture = { kind: "symbol", symbolId: c.picture.symbolId };
      else if (c.picture && "photoIndex" in c.picture) {
        const id = photoIds[c.picture.photoIndex];
        if (id) {
          picture = { kind: "photo", mediaId: id };
          usedPhotos.add(id);
        }
      }
      // An invalid symbolId or out-of-range photoIndex becomes picture: null -- the cell still shows as a coloured word.
      cells.push({
        id: randomUUID(),
        row: c.row, col: c.col,
        kind: isFolder ? "folder" : "word",
        label: c.label,
        say: c.say ?? null,
        picture,
        wordClass: c.wordClass,
        targetPageId: isFolder ? pageIds.get(c.targetPage!) ?? null : null,
        affix: null,
        hidden: false,
        audio: null
      });
    }
    return { id: pageIds.get(p.key)!, name: p.name, cells };
  });
  const homePageId = pageIds.get(draft.pages[0].key)!;
  return { name: draft.name, rows: draft.rows, cols: draft.cols, homePageId, pages, photosUsed: [...usedPhotos] };
}
