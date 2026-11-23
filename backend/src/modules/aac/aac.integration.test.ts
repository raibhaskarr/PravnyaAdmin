import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import sharp from "sharp";
import { prisma } from "../../config/prisma";
import { linkTherapist, makeKid, makeParent, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";
import { symbolExists } from "../symbols/symbols";
import { mediaService } from "../media/media.service";
import { BUILT_IN_BOARDS } from "./aac.templates";
import { boardFieldsSchema } from "./aac.schemas";
import { setTestAiResponse } from "../ai/ai.platform";

// AAC boards: one per child, made from a template (Pravnya's or the centre's) or from scratch, and
// changed by the child's therapists and parent without overwriting each other.

type Board = { id: string; name: string; language: string; rows: number; cols: number; homePageId: string; version: number; pages: Page[] };
type Page = { id: string; name: string; cells: Cell[] };
type Cell = { id: string; row: number; col: number; kind: string; label: string; say: string | null; picture: { kind: string; symbolId?: string; mediaId?: string; url?: string } | null; wordClass: string; targetPageId: string | null; hidden: boolean; audio?: { mediaId: string; url?: string } | null };
type Template = Board & { scope: string; builtIn: boolean; builtInKey: string | null; canEdit: boolean };

async function png() {
  return (await sharp({ create: { width: 20, height: 20, channels: 3, background: "#3a6" } }).png().toBuffer()).toString("base64");
}

/** Board fields ready to send: picture links dropped (the API stores ids only). */
function fields(b: Pick<Board, "name" | "language" | "rows" | "cols" | "homePageId" | "pages">) {
  return {
    name: b.name,
    language: b.language,
    rows: b.rows,
    cols: b.cols,
    homePageId: b.homePageId,
    pages: b.pages.map((p) => ({
      ...p,
      cells: p.cells.map((c) => ({ ...c, picture: c.picture && (c.picture.kind === "symbol" ? { kind: "symbol", symbolId: c.picture.symbolId } : { kind: "photo", mediaId: c.picture.mediaId }), audio: c.audio ? { mediaId: c.audio.mediaId } : null }))
    }))
  };
}

const cell = (row: number, col: number, label: string, over: Partial<Cell> = {}): Cell => ({ id: randomUUID(), row, col, kind: "word", label, say: null, picture: null, wordClass: "misc", targetPageId: null, hidden: false, ...over });

function smallBoard(over: Partial<Board> = {}) {
  const home = randomUUID();
  return { name: "Aarav's words", language: "en", rows: 2, cols: 3, homePageId: home, pages: [{ id: home, name: "Home", cells: [cell(0, 0, "more"), cell(0, 1, "help")] }], ...over };
}

async function world() {
  const centre = await makeTenant({ name: "Sunrise Centre" });
  const other = await makeTenant({ name: "Elsewhere" });
  const fam = await makeParent({ name: "Maya" });
  const kid = await makeKid(centre.id, fam.parent.id, { firstName: "Aarav" });
  const otherKid = await makeKid(centre.id, null, { firstName: "Zoya" });
  const therapist = await makeTherapist(centre.id);
  await linkTherapist(kid.id, therapist.therapist.id);
  const unlinked = await makeTherapist(centre.id);
  const admin = await makeUser("TENANT_ADMIN", centre.id);
  const viewer = await makeUser("VIEWER", centre.id);
  const outsider = await makeUser("TENANT_ADMIN", other.id);
  const superadmin = await makeUser("SUPERADMIN", null);
  const otherFam = await makeParent({ name: "Other" });
  return { centre, fam, kid, otherKid, therapist, unlinked, admin, viewer, outsider, superadmin, otherFam };
}
type W = Awaited<ReturnType<typeof world>>;

const templates = async (token: string, q = "") => (await api().get(`/api/aac-templates${q}`).set(bearer(token))).body as Template[];
const parentUrl = (w: W, path = "") => `/api/parent-kids/${w.kid.id}/aac-board${path}`;

describe("AAC boards", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("built-in boards: every picture exists; they're created once in English and Hindi, and are valid boards", async () => {
    for (const b of BUILT_IN_BOARDS) for (const p of b.pages) for (const c of p.cells) if (c?.[2]) assert.ok(symbolExists(c[2]), `${b.key}/${p.key}: ${c[2]}`);
    const w = await world();
    const all = await templates(w.therapist.token);
    assert.equal(all.length, BUILT_IN_BOARDS.length * 2);
    await templates(w.admin.token);
    assert.equal(await prisma.aacBoardTemplate.count(), BUILT_IN_BOARDS.length * 2);
    for (const t of all) assert.ok(boardFieldsSchema.safeParse(fields(t)).success, t.name);

    const core = all.find((t) => t.builtInKey === "core-24:hi")!;
    assert.equal(core.pages.length, 5);
    const home = core.pages.find((p) => p.id === core.homePageId)!;
    const food = home.cells.find((c) => c.kind === "folder" && c.label === "खाना-पीना")!;
    assert.equal(core.pages.find((p) => p.id === food.targetPageId)!.name, "खाना-पीना");
    // "more" is in the same square on every page.
    for (const p of core.pages) assert.equal(p.cells.find((c) => c.row === 0 && c.col === 3)?.label, "और", p.name);
    assert.match(home.cells[2].picture!.url!, /want_%2C_to\.svg$/);
  });

  test("a therapist makes a child's board from a template; the parent sees and changes it; a stale save is refused, not overwritten", async () => {
    const w = await world();
    const t = (await templates(w.therapist.token, "?language=en")).find((x) => x.builtInKey === "core-24:en")!;
    const made = await api().post("/api/aac-boards").set(bearer(w.therapist.token)).send({ kidId: w.kid.id, ...fields(t), name: "Aarav's board" });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.version, 1);
    assert.equal((await api().post("/api/aac-boards").set(bearer(w.therapist.token)).send({ kidId: w.kid.id, ...smallBoard() })).body.error.code, "BOARD_EXISTS");

    const forParent = (await api().get(parentUrl(w)).set(bearer(w.fam.token))).body.board as Board;
    assert.equal(forParent.name, "Aarav's board");
    assert.match(forParent.pages[0].cells[2].picture!.url!, /\.svg$/);

    // The parent hides "stop" for now: the square stays, the child doesn't see it.
    const b1 = fields(forParent);
    b1.pages[0].cells = b1.pages[0].cells.map((c) => (c.label === "stop" ? { ...c, hidden: true } : c));
    const saved = await api().put(parentUrl(w, `/${forParent.id}`)).set(bearer(w.fam.token)).send({ ...b1, version: 1 });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.version, 2);
    assert.equal(saved.body.pages[0].cells.find((c: Cell) => c.label === "stop").hidden, true);

    // The therapist still has version 1 open: their save is refused.
    const stale = await api().put(`/api/aac-boards/${made.body.id}`).set(bearer(w.therapist.token)).send({ ...fields(made.body), version: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "BOARD_CHANGED");
    const fresh = (await api().get(`/api/aac-boards?kidId=${w.kid.id}`).set(bearer(w.therapist.token))).body.board;
    assert.equal(fresh.version, 2);
    assert.equal(fresh.pages[0].cells.find((c: Cell) => c.label === "stop").hidden, true);
  });

  test("the board is checked: inside the grid, one button per square, folders open a real page, the home page exists", async () => {
    const w = await world();
    const post = (b: object) => api().post("/api/aac-boards").set(bearer(w.therapist.token)).send({ kidId: w.kid.id, ...b });
    const b = smallBoard();
    assert.equal((await post({ ...b, pages: [{ ...b.pages[0], cells: [cell(2, 0, "x")] }] })).status, 400);
    assert.equal((await post({ ...b, pages: [{ ...b.pages[0], cells: [cell(0, 0, "a"), cell(0, 0, "b")] }] })).status, 400);
    assert.equal((await post({ ...b, pages: [{ ...b.pages[0], cells: [cell(0, 0, "Food", { kind: "folder", targetPageId: randomUUID() })] }] })).status, 400);
    assert.equal((await post({ ...b, homePageId: randomUUID() })).status, 400);
    const food = randomUUID();
    const ok = await post({ ...b, pages: [{ ...b.pages[0], cells: [cell(0, 0, "Food", { kind: "folder", targetPageId: food })] }, { id: food, name: "Food", cells: [cell(1, 2, "apple", { picture: { kind: "symbol", symbolId: "apple" } })] }] });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
  });

  test("who: the child's team and parent; viewers read only; others get nothing", async () => {
    const w = await world();
    const made = (await api().post(parentUrl(w)).set(bearer(w.fam.token)).send(smallBoard())).body as Board;
    assert.ok(made.id);
    assert.equal((await api().get(`/api/aac-boards?kidId=${w.kid.id}`).set(bearer(w.unlinked.token))).status, 403);
    assert.equal((await api().get(`/api/aac-boards?kidId=${w.kid.id}`).set(bearer(w.viewer.token))).body.board.id, made.id);
    assert.equal((await api().put(`/api/aac-boards/${made.id}`).set(bearer(w.viewer.token)).send({ ...fields(made), version: 1 })).status, 403);
    assert.equal((await api().put(`/api/aac-boards/${made.id}`).set(bearer(w.outsider.token)).send({ ...fields(made), version: 1 })).status, 403);
    assert.equal((await api().get(parentUrl(w)).set(bearer(w.otherFam.token))).status, 404);
    assert.equal((await api().put(`/api/parent-kids/${w.kid.id}/aac-board/${made.id}`).set(bearer(w.otherFam.token)).send({ ...fields(made), version: 1 })).status, 404);
    await expectParentAuthRequired("get", parentUrl(w), w.therapist.token);
    // Delete to start again.
    assert.equal((await api().delete(`/api/aac-boards/${made.id}`).set(bearer(w.viewer.token))).status, 403);
    assert.equal((await api().delete(parentUrl(w, `/${made.id}`)).set(bearer(w.fam.token))).status, 204);
    assert.equal((await api().get(parentUrl(w)).set(bearer(w.fam.token))).body.board, null);
  });

  test("photos: the child's own and the centre's template photos only; links per viewer; the clean-up keeps photos used on a board", async () => {
    const w = await world();
    const mine = (await api().post(`/api/parent-kids/${w.kid.id}/media`).set(bearer(w.fam.token)).send({ base64: await png() })).body;
    const theirs = (await api().post("/api/media").set(bearer(w.admin.token)).send({ kidId: w.otherKid.id, base64: await png() })).body;
    const centre = (await api().post("/api/media").set(bearer(w.admin.token)).send({ base64: await png() })).body;
    const b = smallBoard();
    const withPhoto = (mediaId: string) => ({ ...b, pages: [{ ...b.pages[0], cells: [cell(0, 0, "Mummy", { picture: { kind: "photo", mediaId } })] }] });
    assert.equal((await api().post(parentUrl(w)).set(bearer(w.fam.token)).send(withPhoto(theirs.id))).status, 400);
    const made = await api().post(parentUrl(w)).set(bearer(w.fam.token)).send({ ...withPhoto(mine.id), pages: [{ ...b.pages[0], cells: [cell(0, 0, "Mummy", { picture: { kind: "photo", mediaId: mine.id } }), cell(0, 1, "Hello song", { picture: { kind: "photo", mediaId: centre.id } })] }] });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.match(made.body.pages[0].cells[0].picture.url, new RegExp(`v=p\\.${w.fam.parent.id}`));
    const staffView = (await api().get(`/api/aac-boards?kidId=${w.kid.id}`).set(bearer(w.therapist.token))).body.board;
    assert.match(staffView.pages[0].cells[0].picture.url, new RegExp(`v=s\\.${w.therapist.user.id}`));
    assert.equal((await api().get(staffView.pages[0].cells[0].picture.url)).status, 200);

    // Photos used only on the board are kept by the clean-up.
    await mediaService.cleanUpUnused(new Date());
    await mediaService.cleanUpUnused(new Date(Date.now() + 30 * 86_400_000));
    const left = new Set((await prisma.mediaAsset.findMany({ select: { id: true } })).map((m) => m.id));
    assert.ok(left.has(mine.id) && left.has(centre.id));
    assert.ok(!left.has(theirs.id)); // never used anywhere
  });

  test("voice recordings: only real audio, only that child's, played through per-viewer links, never put in templates", async () => {
    const w = await world();
    // The start of a WebM file (what Chrome and Android record), then some bytes.
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2000, 7)]).toString("base64");
    const m4a = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(2000, 1)]).toString("base64");

    const mine = await api().post(`/api/parent-kids/${w.kid.id}/media/audio`).set(bearer(w.fam.token)).send({ base64: webm });
    assert.equal(mine.status, 201, JSON.stringify(mine.body));
    const iphone = await api().post(`/api/parent-kids/${w.kid.id}/media/audio`).set(bearer(w.fam.token)).send({ base64: m4a });
    assert.equal(iphone.status, 201);
    assert.equal((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: iphone.body.id } })).mimeType, "audio/mp4");
    const therapists = await api().post("/api/media/audio").set(bearer(w.therapist.token)).send({ kidId: w.kid.id, base64: webm });
    assert.equal(therapists.status, 201);

    // A picture isn't a recording, and a recording isn't a picture.
    const notAudio = await api().post(`/api/parent-kids/${w.kid.id}/media/audio`).set(bearer(w.fam.token)).send({ base64: await png() });
    assert.equal(notAudio.body.error.code, "NOT_AUDIO");
    assert.equal((await api().post(`/api/parent-kids/${w.kid.id}/media`).set(bearer(w.fam.token)).send({ base64: webm })).status, 400);
    // Not for someone else's child, and not too long.
    assert.equal((await api().post(`/api/parent-kids/${w.otherKid.id}/media/audio`).set(bearer(w.fam.token)).send({ base64: webm })).status, 404);
    assert.equal((await api().post("/api/media/audio").set(bearer(w.unlinked.token)).send({ kidId: w.kid.id, base64: webm })).status, 403);
    const long = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(1024 * 1024 + 10)]).toString("base64");
    assert.equal((await api().post(`/api/parent-kids/${w.kid.id}/media/audio`).set(bearer(w.fam.token)).send({ base64: long })).status, 400);
    const othersVoice = (await api().post("/api/media/audio").set(bearer(w.admin.token)).send({ kidId: w.otherKid.id, base64: webm })).body;

    const b = smallBoard();
    const board = (cells: Cell[]) => ({ ...b, pages: [{ ...b.pages[0], cells }] });
    // Another child's recording, or a recording used as a photo, is refused.
    assert.equal((await api().post(parentUrl(w)).set(bearer(w.fam.token)).send(board([cell(0, 0, "more", { audio: { mediaId: othersVoice.id } })]))).status, 400);
    assert.equal((await api().post(parentUrl(w)).set(bearer(w.fam.token)).send(board([cell(0, 0, "more", { picture: { kind: "photo", mediaId: mine.body.id } })]))).status, 400);

    const made = await api().post(parentUrl(w)).set(bearer(w.fam.token)).send(board([cell(0, 0, "paani", { audio: { mediaId: mine.body.id } }), cell(0, 1, "more", { audio: { mediaId: therapists.body.id } })]));
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const url = made.body.pages[0].cells[0].audio.url as string;
    assert.match(url, new RegExp(`^/api/media/${mine.body.id}\\?v=p\\.${w.fam.parent.id}`));
    const played = await api().get(url);
    assert.equal(played.status, 200);
    assert.equal(played.headers["content-type"], "audio/webm");
    // Another family can't play it even with a link made for them.
    const { mediaPath } = await import("../media/media.service");
    assert.equal((await api().get(mediaPath(mine.body.id, { kind: "parent", id: w.otherFam.parent.id }))).status, 404);

    // Templates never carry a child's voice.
    const tpl = await api().post("/api/aac-templates").set(bearer(w.admin.token)).send(board([cell(0, 0, "more", { audio: { mediaId: therapists.body.id } })]));
    assert.equal(tpl.status, 400);
    const saved = await api().post(`/api/aac-templates/from-board/${made.body.id}`).set(bearer(w.therapist.token)).send({});
    assert.equal(saved.status, 201);
    assert.ok(saved.body.pages[0].cells.every((c: Cell) => c.audio === null));

    // The clean-up keeps recordings used on a board; an unused one goes.
    await mediaService.cleanUpUnused(new Date());
    await mediaService.cleanUpUnused(new Date(Date.now() + 30 * 86_400_000));
    const left = new Set((await prisma.mediaAsset.findMany({ select: { id: true } })).map((m) => m.id));
    assert.ok(left.has(mine.body.id) && left.has(therapists.body.id));
    assert.ok(!left.has(iphone.body.id));
  });

  test("templates: centres make their own; save a board as one (child photos left out); parents see Pravnya's and their centre's", async () => {
    const w = await world();
    const ct = await api().post("/api/aac-templates").set(bearer(w.therapist.token)).send(smallBoard({ name: "Our circle time" }));
    assert.equal(ct.status, 201, JSON.stringify(ct.body));
    assert.equal(ct.body.scope, "CENTRE");
    assert.equal((await api().put(`/api/aac-templates/${ct.body.id}`).set(bearer(w.unlinked.token)).send(fields(ct.body))).status, 403);
    assert.equal((await api().put(`/api/aac-templates/${ct.body.id}`).set(bearer(w.admin.token)).send({ ...fields(ct.body), name: "Circle time" })).status, 200);
    assert.ok(!(await templates(w.outsider.token)).some((t) => t.id === ct.body.id));
    const builtIn = (await templates(w.superadmin.token)).find((t) => t.builtIn)!;
    assert.equal((await api().put(`/api/aac-templates/${builtIn.id}`).set(bearer(w.admin.token)).send(fields(builtIn))).status, 403);
    assert.equal((await api().put(`/api/aac-templates/${builtIn.id}`).set(bearer(w.superadmin.token)).send({ ...fields(builtIn), name: "Starter" })).status, 200);

    const kidPhoto = (await api().post("/api/media").set(bearer(w.therapist.token)).send({ kidId: w.kid.id, base64: await png() })).body;
    const b = smallBoard();
    const board = (await api().post("/api/aac-boards").set(bearer(w.therapist.token)).send({ kidId: w.kid.id, ...b, pages: [{ ...b.pages[0], cells: [cell(0, 0, "Mummy", { picture: { kind: "photo", mediaId: kidPhoto.id } }), cell(0, 1, "more")] }] })).body;
    const saved = await api().post(`/api/aac-templates/from-board/${board.id}`).set(bearer(w.therapist.token)).send({ name: "Starter for new kids" });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.droppedPhotos, 1);
    assert.equal(saved.body.pages[0].cells[0].picture, null);

    const parentList = (await api().get(`/api/parent-kids/${w.kid.id}/aac-templates?language=en`).set(bearer(w.fam.token))).body as Template[];
    assert.deepEqual(parentList.filter((t) => t.scope === "CENTRE").map((t) => t.name).sort(), ["Circle time", "Starter for new kids"]);
    assert.equal(parentList.filter((t) => t.scope === "PRAVNYA").length, BUILT_IN_BOARDS.length);
  });

  test("AI draft: brief + the kid's photos -> a draft board. Symbols are checked, foreign photos dropped; nothing is saved", async () => {
    const w = await world();
    const ourPhoto = (await api().post("/api/media").set(bearer(w.therapist.token)).send({ kidId: w.kid.id, base64: await png() })).body;
    // A photo for Zoya, not for Aarav -- the AI must not be allowed to place it on Aarav's board.
    const otherKidPhoto = (await api().post("/api/media").set(bearer(w.admin.token)).send({ kidId: w.otherKid.id, base64: await png() })).body;

    setTestAiResponse("aac-board-draft", {
      name: "Aarav's lunch board",
      rows: 2, cols: 3,
      pages: [
        {
          key: "home", name: "Home",
          cells: [
            { row: 0, col: 0, label: "eat", say: "eat", wordClass: "verb", kind: "word", targetPage: null, picture: { symbolId: "eat_,_to" } },
            { row: 0, col: 1, label: "my cup", say: "my cup", wordClass: "noun", kind: "word", targetPage: null, picture: { photoIndex: 0 } },
            { row: 0, col: 2, label: "more", say: "more", wordClass: "describe", kind: "word", targetPage: null, picture: { symbolId: "more" } },
            { row: 1, col: 1, label: "oops", say: "oops", wordClass: "noun", kind: "word", targetPage: null, picture: { photoIndex: 1 } }, // index 1 doesn't exist after we drop Zoya's photo
            { row: 1, col: 2, label: "all done", say: "all done", wordClass: "social", kind: "word", targetPage: null, picture: { symbolId: "finish" } }
          ]
        }
      ]
    });
    const draft = await api().post("/api/aac-boards/draft").set(bearer(w.therapist.token)).send({
      kidId: w.kid.id, brief: "A small lunch board for Aarav with his own cup and water", language: "en", mediaIds: [ourPhoto.id, otherKidPhoto.id]
    });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    assert.equal(draft.body.name, "Aarav's lunch board");
    assert.deepEqual([draft.body.rows, draft.body.cols], [2, 3]);
    // Only Aarav's photo is in the AI's attached images, so photoIndex 0 maps to that; index 1 is rejected by the schema.
    assert.deepEqual(draft.body.photosUsed, [ourPhoto.id]);
    const cells = draft.body.pages[0].cells;
    // "oops" referred to photoIndex 1, which doesn't exist (Zoya's photo was dropped before the AI saw anything). The cell survives with no picture; it shows as a coloured word.
    assert.deepEqual(cells.map((c: any) => [c.label, c.picture?.kind ?? null]).sort(), [["all done", "symbol"], ["eat", "symbol"], ["more", "symbol"], ["my cup", "photo"], ["oops", null]].sort());
    // Nothing persisted: no board for this kid.
    assert.equal(await prisma.aacBoard.count({ where: { kidId: w.kid.id } }), 0);

    // An invented symbol id doesn't kill the draft -- the cell just comes back with no picture.
    setTestAiResponse("aac-board-draft", { name: "x", rows: 2, cols: 2, pages: [{ key: "home", name: "Home", cells: [{ row: 0, col: 0, label: "hello", say: "hello", wordClass: "noun", kind: "word", targetPage: null, picture: { symbolId: "not-a-real-symbol" } }] }] });
    const okDraft = await api().post("/api/aac-boards/draft").set(bearer(w.therapist.token)).send({ kidId: w.kid.id, brief: "a tiny test board", language: "en", mediaIds: [] });
    assert.equal(okDraft.status, 200);
    assert.equal(okDraft.body.pages[0].cells[0].picture, null);

    // A viewer can't draft; another centre's admin gets forbidden.
    assert.equal((await api().post("/api/aac-boards/draft").set(bearer(w.viewer.token)).send({ kidId: w.kid.id, brief: "a tiny test board", language: "en", mediaIds: [] })).status, 403);
    assert.equal((await api().post("/api/aac-boards/draft").set(bearer(w.outsider.token)).send({ kidId: w.kid.id, brief: "a tiny test board", language: "en", mediaIds: [] })).status, 403);
  });
});
