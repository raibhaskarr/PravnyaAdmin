import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { linkTherapist, makeKid, makeParent, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";
import type { Cell } from "./aac.schemas";

// Usage stats live here because they slice across the board JSON and the AacCellTap log.

const cell = (row: number, col: number, label: string, over: Partial<Cell> = {}): Cell => ({ id: randomUUID(), row, col, kind: "word", label, say: null, picture: null, wordClass: "verb", targetPageId: null, hidden: false, audio: null, ...over });

async function world() {
  const centre = await makeTenant({ name: "Sunrise" });
  const other = await makeTenant({ name: "Elsewhere" });
  const fam = await makeParent({ name: "Maya" });
  const kid = await makeKid(centre.id, fam.parent.id, { firstName: "Aarav" });
  const therapist = await makeTherapist(centre.id);
  await linkTherapist(kid.id, therapist.therapist.id);
  const outsider = await makeUser("TENANT_ADMIN", other.id);
  const otherFam = await makeParent({ name: "Other" });
  const homeId = randomUUID();
  const foodId = randomUUID();
  const eatId = randomUUID();
  const drinkId = randomUUID();
  const foodFolderId = randomUUID();
  const neverId = randomUUID();
  const appleId = randomUUID();
  const board = await prisma.aacBoard.create({
    data: {
      tenantId: centre.id, kidId: kid.id, name: "Board", language: "en", rows: 2, cols: 3, homePageId: homeId, updatedByName: "Tester",
      pages: [
        { id: homeId, name: "Home", cells: [
          { ...cell(0, 0, "eat"), id: eatId },
          { ...cell(0, 1, "drink"), id: drinkId },
          { ...cell(0, 2, "never"), id: neverId },
          { ...cell(1, 0, "Food", { kind: "folder", targetPageId: foodId, wordClass: "misc" }), id: foodFolderId }
        ] },
        { id: foodId, name: "Food", cells: [
          { ...cell(0, 0, "apple", { wordClass: "noun" }), id: appleId }
        ] }
      ] as unknown as object
    }
  });
  return { centre, fam, kid, therapist, outsider, otherFam, board, ids: { home: homeId, food: foodId, eat: eatId, drink: drinkId, never: neverId, foodFolder: foodFolderId, apple: appleId } };
}

describe("AAC usage stats", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("the parent logs taps; the therapist sees them grouped by day, top words, quiet pages, never-tapped cells", async () => {
    const w = await world();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    const nowIso = new Date(now.getTime() - 60_000).toISOString();
    const taps = [
      { cellId: w.ids.eat, pageId: w.ids.home, label: "eat", wordClass: "verb", kind: "word" as const, at: nowIso },
      { cellId: w.ids.eat, pageId: w.ids.home, label: "eat", wordClass: "verb", kind: "word" as const, at: nowIso },
      { cellId: w.ids.drink, pageId: w.ids.home, label: "drink", wordClass: "verb", kind: "word" as const, at: nowIso },
      { cellId: w.ids.foodFolder, pageId: w.ids.home, label: "Food", wordClass: "misc", kind: "folder" as const, at: nowIso },
      { cellId: w.ids.drink, pageId: w.ids.home, label: "drink", wordClass: "verb", kind: "word" as const, at: yesterday }
    ];
    const r = await api().post(`/api/parent-kids/${w.kid.id}/aac-board/taps`).set(bearer(w.fam.token)).send({ taps });
    assert.equal(r.status, 200);
    assert.equal(r.body.saved, 5);

    const stats = (await api().get(`/api/aac-boards/stats?kidId=${w.kid.id}&windowDays=7`).set(bearer(w.therapist.token))).body.stats;
    assert.equal(stats.totals.words, 4, "folder taps don't count as said words");
    assert.equal(stats.totals.windowDays, 7);
    assert.ok(stats.perDay.length === 7);
    assert.ok(stats.perDay.some((d: { words: number }) => d.words > 0));
    assert.deepEqual(stats.topWords.slice(0, 2).map((w: { label: string }) => w.label).sort(), ["drink", "eat"]);
    assert.deepEqual(stats.quietPages.map((p: { name: string }) => p.name), ["Food"]);
    const neverLabels = stats.neverTapped.map((c: { label: string }) => c.label).sort();
    assert.deepEqual(neverLabels, ["apple", "never"]);

    // Parent weekly summary: same totals, fewer fields.
    const parentSum = (await api().get(`/api/parent-kids/${w.kid.id}/aac-board/stats`).set(bearer(w.fam.token))).body.stats;
    assert.equal(parentSum.totals.words, 4);
    assert.equal(parentSum.topWords.length, 2);
  });

  test("taps for a cell that no longer exists on the board are quietly dropped; taps from far in the past too", async () => {
    const w = await world();
    const r = await api().post(`/api/parent-kids/${w.kid.id}/aac-board/taps`).set(bearer(w.fam.token)).send({
      taps: [
        { cellId: randomUUID(), pageId: w.ids.home, label: "gone", wordClass: "verb", kind: "word" }, // unknown cell
        { cellId: w.ids.eat, pageId: w.ids.home, label: "eat", wordClass: "verb", kind: "word", at: new Date(Date.now() - 72 * 60 * 60_000).toISOString() } // > 48h old
      ]
    });
    assert.equal(r.body.saved, 0);
  });

  test("access: another parent can't log or read; an outsider therapist can't read", async () => {
    const w = await world();
    const bad = { taps: [{ cellId: w.ids.eat, pageId: w.ids.home, label: "eat", wordClass: "verb", kind: "word" as const }] };
    assert.equal((await api().post(`/api/parent-kids/${w.kid.id}/aac-board/taps`).set(bearer(w.otherFam.token)).send(bad)).status, 404);
    assert.equal((await api().get(`/api/parent-kids/${w.kid.id}/aac-board/stats`).set(bearer(w.otherFam.token))).status, 404);
    assert.equal((await api().get(`/api/aac-boards/stats?kidId=${w.kid.id}`).set(bearer(w.outsider.token))).status, 403);
  });
});
