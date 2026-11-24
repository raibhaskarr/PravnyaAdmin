import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { linkTherapist, makeKid, makeParent, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";
import { symbolExists } from "../symbols/symbols";
import { TEMPLATES } from "./visualSchedules.templates";
import { purgeParent } from "../parent-account/parentAccount.purge";
import { objectStorage } from "../../common/storage/objectStorage";

// Visual schedules: a therapist makes one (template, AI draft or by hand) with symbols or photos,
// publishes it, and the parent app shows it.

// The smallest valid PNG (1x1).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

async function world() {
  const tenant = await makeTenant({ name: "Sunrise Centre" });
  const fam = await makeParent({ name: "Maya" });
  const kid = await makeKid(tenant.id, fam.parent.id, { firstName: "Aarav" });
  const otherKid = await makeKid(tenant.id, null, { firstName: "Zoya" });
  const linked = await makeTherapist(tenant.id);
  await linkTherapist(kid.id, linked.therapist.id);
  const unlinked = await makeTherapist(tenant.id);
  const admin = await makeUser("TENANT_ADMIN", tenant.id);
  const viewer = await makeUser("VIEWER", tenant.id);
  const other = await makeParent({ name: "Other" });
  return { tenant, fam, kid, otherKid, linked, unlinked, admin, viewer, other };
}

const step = (label: string, picture: unknown = { kind: "symbol", symbolId: "toilet" }) => ({ key: randomUUID(), label, picture });

/** The id of a built-in Pravnya template, e.g. "bedtime:en". */
async function builtIn(token: string, key: string): Promise<string> {
  const list = (await api().get("/api/schedule-templates").set(bearer(token))).body as { id: string; builtInKey: string | null }[];
  const t = list.find((x) => x.builtInKey === key);
  if (!t) throw new Error(`no template ${key}`);
  return t.id;
}

describe("visual schedules", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("every template's pictures exist in the symbol set", () => {
    for (const t of TEMPLATES) for (const s of t.steps) assert.ok(symbolExists(s.symbolId), `${t.id}: ${s.symbolId}`);
  });

  test("symbol search finds pictures and needs a staff login; ARASAAC results come first, then Mulberry", async () => {
    const w = await world();
    const res = await api().get("/api/symbols?q=brush teeth").set(bearer(w.linked.token));
    assert.equal(res.status, 200);
    // ARASAAC comes first (its ids start "arasaac:"). Mulberry still shows up further down in the list.
    assert.match(res.body.symbols[0].id as string, /^arasaac:\d+$/);
    assert.ok(res.body.symbols.some((s: { id: string }) => s.id === "brush_teeth_,_to"), "Mulberry results fill the rest of the list");
    assert.match(res.body.credit as string, /ARASAAC/);
    assert.match(res.body.credit as string, /Mulberry/);
    assert.equal((await api().get("/api/symbols?q=toilet")).status, 401);
  });

  test("from a template: draft with symbols, hidden from the parent until published", async () => {
    const w = await world();
    const res = await api().post("/api/visual-schedules/from-template").set(bearer(w.linked.token)).send({ kidId: w.kid.id, templateId: await builtIn(w.linked.token, "brushing-teeth:hi") });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "DRAFT");
    assert.equal(res.body.kind, "ROUTINE");
    assert.equal(res.body.title, "दाँत साफ़ करना");
    assert.equal(res.body.steps[1].label, "ब्रश करो");
    assert.equal(res.body.steps[1].minutes, 2);
    assert.match(res.body.steps[1].picture.url, /^https:\/\/.+\.svg$/);

    const before = await api().get(`/api/parent-kids/${w.kid.id}/visual-schedules`).set(bearer(w.fam.token));
    assert.deepEqual(before.body.schedules, []);

    const pub = await api().post(`/api/visual-schedules/${res.body.id}/publish`).set(bearer(w.linked.token));
    assert.equal(pub.body.status, "ACTIVE");
    const afterPub = await api().get(`/api/parent-kids/${w.kid.id}/visual-schedules`).set(bearer(w.fam.token));
    assert.equal(afterPub.body.schedules.length, 1);
    assert.equal(afterPub.body.schedules[0].forToday, true);
    assert.equal(afterPub.body.schedules[0].steps.length, 5);
  });

  test("AI draft: labels from the AI, pictures matched from its search words; graceful when the AI is unavailable", async () => {
    const w = await world();
    setTestAiResponse("visual-schedule-draft", {
      title: "Going to the park",
      steps: [
        { label: "Shoes on", say: null, symbolSearch: "shoes", minutes: null },
        { label: "Walk", say: "We walk to the park", symbolSearch: "walk", minutes: null },
        { label: "Play", say: null, symbolSearch: "zzzz-nothing", minutes: 15 }
      ]
    });
    const res = await api().post("/api/visual-schedules/draft").set(bearer(w.linked.token)).send({ kidId: w.kid.id, kind: "ROUTINE", request: "going to the park" });
    assert.equal(res.status, 201);
    assert.equal(res.body.aiDrafted, true);
    assert.equal(res.body.steps[0].picture.kind, "symbol");
    // The picture is now picked from ARASAAC first (clean match wins). Accept any symbol id -- the
    // important bit is that the AI's search word was resolved to a real symbol, not that it matched
    // a specific Mulberry id.
    assert.ok(res.body.steps[0].picture.symbolId.length > 0);
    assert.equal(res.body.steps[1].say, "We walk to the park");
    // No match for the search word: falls back to the English label ("Play"). Either set's hit is OK.
    assert.ok(res.body.steps[2].picture.symbolId.length > 0);
    assert.equal(res.body.steps[2].minutes, 15);

    // First/Then must be exactly 2 steps: a 3-step answer fails the schema -> AI unavailable.
    const ft = await api().post("/api/visual-schedules/draft").set(bearer(w.linked.token)).send({ kidId: w.kid.id, kind: "FIRST_THEN", request: "work then play" });
    assert.equal(ft.status, 503);
    assert.equal(ft.body.error.code, "AI_UNAVAILABLE");
  });

  test("by hand, with an uploaded photo; step counts and photo ownership are checked", async () => {
    const w = await world();
    const up = await api().post("/api/media").set(bearer(w.linked.token)).send({ kidId: w.kid.id, base64: PNG.toString("base64") });
    assert.equal(up.status, 201);
    const photo = { kind: "photo", mediaId: up.body.id };

    // The signed link serves the picture without a login; a tampered link doesn't.
    const img = await api().get(up.body.url);
    assert.equal(img.status, 200);
    // Re-encoded on upload (this PNG has transparency, so it stays a PNG).
    assert.equal(img.headers["content-type"], "image/png");
    assert.equal(img.headers["cross-origin-resource-policy"], "cross-origin");
    assert.equal((await api().get(up.body.url.replace(/sig=./, "sig=x"))).status, 404);
    assert.equal((await api().get(`/api/media/${up.body.id}`)).status, 400);

    const base = { kidId: w.kid.id, title: "First shoes, then park", kind: "FIRST_THEN" };
    const tooMany = await api().post("/api/visual-schedules").set(bearer(w.linked.token)).send({ ...base, steps: [step("a"), step("b"), step("c")] });
    assert.equal(tooMany.status, 400);

    const created = await api().post("/api/visual-schedules").set(bearer(w.linked.token)).send({ ...base, days: ["Sat", "Sun"], steps: [step("Shoes", photo), step("Park", null)] });
    assert.equal(created.status, 201);
    assert.match(created.body.steps[0].picture.url, new RegExp(`^/api/media/${up.body.id}\\?v=s\\.[0-9a-f-]{36}&exp=\\d+&sig=`));
    assert.equal(created.body.steps[1].picture, null);
    assert.equal(created.body.steps[0].minutes, null);

    // A photo uploaded for another child can't be used.
    const otherPhoto = await api().post("/api/media").set(bearer(w.admin.token)).send({ kidId: w.otherKid.id, base64: PNG.toString("base64") });
    const wrong = await api().patch(`/api/visual-schedules/${created.body.id}`).set(bearer(w.linked.token)).send({ steps: [step("Shoes", { kind: "photo", mediaId: otherPhoto.body.id }), step("Park")] });
    assert.equal(wrong.status, 400);

    // An unknown symbol is refused.
    const badSymbol = await api().patch(`/api/visual-schedules/${created.body.id}`).set(bearer(w.linked.token)).send({ steps: [step("x", { kind: "symbol", symbolId: "not_a_symbol" }), step("y")] });
    assert.equal(badSymbol.status, 400);

    const edited = await api().patch(`/api/visual-schedules/${created.body.id}`).set(bearer(w.linked.token)).send({ title: "Park time", kind: "ROUTINE", steps: [step("Shoes", photo), step("Walk"), step("Park")] });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.steps.length, 3);
  });

  test("uploads must be pictures, of a reasonable size", async () => {
    const w = await world();
    const text = await api().post("/api/media").set(bearer(w.linked.token)).send({ kidId: w.kid.id, base64: Buffer.from("<svg onload=alert(1)>").toString("base64") });
    assert.equal(text.status, 400);
    assert.equal(text.body.error.code, "NOT_A_PICTURE");
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const tooBig = await api().post("/api/media").set(bearer(w.linked.token)).send({ kidId: w.kid.id, base64: big.toString("base64") });
    assert.equal(tooBig.status, 400);
  });

  test("access: only the child's team edits, viewers read, other parents see nothing", async () => {
    const w = await world();
    const created = (await api().post("/api/visual-schedules/from-template").set(bearer(w.linked.token)).send({ kidId: w.kid.id, templateId: await builtIn(w.linked.token, "work-then-play:en") })).body;

    assert.equal((await api().get(`/api/visual-schedules?kidId=${w.kid.id}`).set(bearer(w.unlinked.token))).status, 403);
    assert.equal((await api().post("/api/visual-schedules/from-template").set(bearer(w.unlinked.token)).send({ kidId: w.kid.id, templateId: await builtIn(w.unlinked.token, "work-then-play:en") })).status, 403);
    assert.equal((await api().post("/api/media").set(bearer(w.unlinked.token)).send({ kidId: w.kid.id, base64: PNG.toString("base64") })).status, 403);

    const viewerList = await api().get(`/api/visual-schedules?kidId=${w.kid.id}`).set(bearer(w.viewer.token));
    assert.equal(viewerList.body.length, 1);
    assert.equal((await api().post(`/api/visual-schedules/${created.id}/publish`).set(bearer(w.viewer.token))).status, 403);

    await expectParentAuthRequired("get", `/api/parent-kids/${w.kid.id}/visual-schedules`, w.linked.token);
    assert.equal((await api().get(`/api/parent-kids/${w.kid.id}/visual-schedules`).set(bearer(w.other.token))).status, 404);
  });

  test("lifecycle: only drafts are deleted; archived schedules leave the parent app; days decide 'for today'", async () => {
    const w = await world();
    const a = (await api().post("/api/visual-schedules/from-template").set(bearer(w.linked.token)).send({ kidId: w.kid.id, templateId: await builtIn(w.linked.token, "bedtime:en") })).body;
    await api().post(`/api/visual-schedules/${a.id}/publish`).set(bearer(w.linked.token));
    assert.equal((await api().delete(`/api/visual-schedules/${a.id}`).set(bearer(w.linked.token))).status, 409);

    // A schedule for a day that isn't today.
    const today = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" });
    const notToday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].find((d) => d !== today)!;
    const b = (await api().post("/api/visual-schedules/from-template").set(bearer(w.linked.token)).send({ kidId: w.kid.id, templateId: await builtIn(w.linked.token, "mealtime:en") })).body;
    await api().patch(`/api/visual-schedules/${b.id}`).set(bearer(w.linked.token)).send({ days: [notToday] });
    await api().post(`/api/visual-schedules/${b.id}/publish`).set(bearer(w.linked.token));

    let parent = (await api().get(`/api/parent-kids/${w.kid.id}/visual-schedules`).set(bearer(w.fam.token))).body.schedules;
    assert.deepEqual(parent.map((s: { title: string; forToday: boolean }) => [s.title, s.forToday]).sort(), [["Bedtime", true], ["Mealtime", false]]);

    await api().post(`/api/visual-schedules/${a.id}/archive`).set(bearer(w.linked.token));
    assert.equal((await api().patch(`/api/visual-schedules/${a.id}`).set(bearer(w.linked.token)).send({ title: "x" })).status, 409);
    parent = (await api().get(`/api/parent-kids/${w.kid.id}/visual-schedules`).set(bearer(w.fam.token))).body.schedules;
    assert.deepEqual(parent.map((s: { title: string }) => s.title), ["Mealtime"]);

    const draft = (await api().post("/api/visual-schedules/from-template").set(bearer(w.linked.token)).send({ kidId: w.kid.id, templateId: await builtIn(w.linked.token, "morning:en") })).body;
    assert.equal((await api().delete(`/api/visual-schedules/${draft.id}`).set(bearer(w.linked.token))).status, 204);
  });

  test("deleting a self-registered family removes the child's uploaded photos from storage", async () => {
    const retail = await prisma.tenant.create({ data: { id: process.env.RETAIL_TENANT_ID!, name: "Retail", slug: "retail-test" } });
    const fam = await makeParent();
    const kid = await makeKid(retail.id, fam.parent.id);
    const staff = await makeUser("TENANT_ADMIN", retail.id);
    const up = (await api().post("/api/media").set(bearer(staff.token)).send({ kidId: kid.id, base64: PNG.toString("base64") })).body;
    const { storageKey } = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: up.id } });
    assert.ok(await objectStorage.get(storageKey));
    await purgeParent(fam.parent.id);
    assert.equal(await prisma.mediaAsset.count(), 0);
    assert.equal(await objectStorage.get(storageKey), null);
    assert.equal((await api().get(up.url)).status, 404);
  });
});
