import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import sharp from "sharp";
import { prisma } from "../../config/prisma";
import { linkTherapist, makeKid, makeParent, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";
import { objectStorage } from "../../common/storage/objectStorage";
import { mediaPath, mediaService, UNUSED_DAYS } from "./media.service";
import { purgeParent } from "../parent-account/parentAccount.purge";

// Children's photos stay with that child: only the child's family and team can see them, links are
// made for one viewer and re-checked every time, location data is removed, unused photos go.

const DAY = 86_400_000;

async function photo(opts: { width?: number; height?: number; gps?: boolean } = {}) {
  let img = sharp({ create: { width: opts.width ?? 40, height: opts.height ?? 30, channels: 3, background: { r: 200, g: 80, b: 40 } } }).jpeg();
  if (opts.gps) img = img.withExif({ IFD0: { Make: "PhoneCo", Model: "Pocket 9" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "28/1 36/1 50/1", GPSLongitudeRef: "E", GPSLongitude: "77/1 12/1 30/1" } });
  return (await img.toBuffer()).toString("base64");
}

async function world() {
  const centre = await makeTenant({ name: "Sunrise Centre" });
  const otherCentre = await makeTenant({ name: "Elsewhere" });
  const famA = await makeParent({ name: "Maya" });
  const famB = await makeParent({ name: "Ravi" });
  const kidA = await makeKid(centre.id, famA.parent.id, { firstName: "Aarav" });
  const kidB = await makeKid(centre.id, famB.parent.id, { firstName: "Zoya" });
  const therapist = await makeTherapist(centre.id);
  await linkTherapist(kidA.id, therapist.therapist.id);
  const otherTherapist = await makeTherapist(centre.id); // same centre, not on Aarav's team
  const admin = await makeUser("TENANT_ADMIN", centre.id);
  const outsider = await makeUser("TENANT_ADMIN", otherCentre.id);
  const guest = await makeTherapist(otherCentre.id); // another centre's therapist, on Aarav's team
  await linkTherapist(kidA.id, guest.therapist.id);
  const famC = await makeParent({ name: "Other centre" });
  await makeKid(otherCentre.id, famC.parent.id, { firstName: "Ira" });
  return { centre, otherCentre, famA, famB, famC, kidA, kidB, therapist, otherTherapist, admin, outsider, guest };
}
type W = Awaited<ReturnType<typeof world>>;

/** A photo of Aarav uploaded by his parent. */
async function aaravPhoto(w: W, opts?: Parameters<typeof photo>[0]) {
  const res = await api().post(`/api/parent-kids/${w.kidA.id}/media`).set(bearer(w.famA.token)).send({ base64: await photo(opts) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as { id: string; url: string };
}

const get = (url: string) => api().get(url);
const status = async (url: string) => (await get(url)).status;

describe("photo isolation", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("location and camera data are removed and the size is capped; the file is stored under the child", async () => {
    const w = await world();
    const original = Buffer.from(await photo({ width: 3000, height: 2000, gps: true }), "base64");
    assert.ok((await sharp(original).metadata()).exif, "the test photo has EXIF");
    const up = await aaravPhoto(w, { width: 3000, height: 2000, gps: true });
    const res = await get(up.url);
    assert.equal(res.status, 200);
    const meta = await sharp(Buffer.from(res.body)).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(meta.xmp, undefined);
    assert.equal(meta.width, 1600);
    assert.equal(meta.height, 1067);
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: up.id } });
    assert.equal(asset.storageKey, `media/${w.centre.id}/${w.kidA.id}/${up.id}`);
    assert.equal(asset.uploadedByParentId, w.famA.parent.id);
  });

  test("a file that only looks like a picture is refused", async () => {
    const w = await world();
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<script>alert(1)</script>".repeat(20))]);
    const res = await api().post(`/api/parent-kids/${w.kidA.id}/media`).set(bearer(w.famA.token)).send({ base64: fake.toString("base64") });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "NOT_A_PICTURE");
    assert.equal(await prisma.mediaAsset.count(), 0);
  });

  test("a parent can't upload for, or use a photo of, someone else's child", async () => {
    const w = await world();
    assert.equal((await api().post(`/api/parent-kids/${w.kidA.id}/media`).set(bearer(w.famB.token)).send({ base64: await photo() })).status, 404);
    const up = await aaravPhoto(w);
    const res = await api()
      .post(`/api/parent-kids/${w.kidB.id}/visual-schedules`)
      .set(bearer(w.famB.token))
      .send({ title: "x", kind: "ROUTINE", steps: [{ key: randomUUID(), label: "a", picture: { kind: "photo", mediaId: up.id } }, { key: randomUUID(), label: "b" }] });
    assert.equal(res.status, 400);
  });

  test("a link works only for the viewer it was made for, until it expires, and can't be altered", async () => {
    const w = await world();
    const up = await aaravPhoto(w);
    const ok = await get(up.url);
    assert.equal(ok.status, 200);
    assert.match(ok.headers["cache-control"], /^private, no-transform, max-age=\d+$/);
    assert.equal(ok.headers["referrer-policy"], "no-referrer");

    // Swapping in another family's id, or changing the expiry, breaks the signature.
    assert.equal(await status(up.url.replace(w.famA.parent.id, w.famB.parent.id)), 404);
    const exp = Number(/exp=(\d+)/.exec(up.url)![1]);
    assert.equal(await status(up.url.replace(`exp=${exp}`, `exp=${exp + 86400}`)), 404);
    assert.equal(await status(up.url.replace(/sig=[^&]+/, "sig=AAAA")), 404);
    assert.equal(await status(`/api/media/${up.id}`), 400);

    // Expired: a link made 2 hours ago.
    assert.equal(await status(mediaPath(up.id, { kind: "parent", id: w.famA.parent.id }, Date.now() - 2 * 3600_000)), 404);
    // Links last 60-75 minutes.
    const exp2 = Number(/exp=(\d+)/.exec(mediaPath(up.id, { kind: "parent", id: w.famA.parent.id }))![1]) * 1000 - Date.now();
    assert.ok(exp2 > 59 * 60_000 && exp2 <= 75 * 60_000, String(exp2));
  });

  test("even with a genuine link, only the child's own family and team can see it, re-checked every time", async () => {
    const w = await world();
    const up = await aaravPhoto(w);
    const linkFor = (kind: "parent" | "staff", id: string) => status(mediaPath(up.id, { kind, id }));

    assert.equal(await linkFor("parent", w.famA.parent.id), 200); // Aarav's parent
    assert.equal(await linkFor("staff", w.therapist.user.id), 200); // on his team
    assert.equal(await linkFor("staff", w.admin.user.id), 200); // his centre's admin
    assert.equal(await linkFor("staff", w.guest.user.id), 200); // guest therapist on his team

    assert.equal(await linkFor("parent", w.famB.parent.id), 404); // another family at the same centre
    assert.equal(await linkFor("parent", w.famC.parent.id), 404); // a family at another centre
    assert.equal(await linkFor("staff", w.otherTherapist.user.id), 404); // same centre, not his team
    assert.equal(await linkFor("staff", w.outsider.user.id), 404); // another centre's admin
    const superadmin = await makeUser("SUPERADMIN", null);
    assert.equal(await linkFor("staff", superadmin.user.id), 404);
    assert.equal(await linkFor("parent", randomUUID()), 404);

    // Taken off his team: the therapist's existing link stops working at once.
    const therapistLink = mediaPath(up.id, { kind: "staff", id: w.therapist.user.id });
    assert.equal(await status(therapistLink), 200);
    await prisma.kidTherapist.deleteMany({ where: { kidId: w.kidA.id, therapistId: w.therapist.therapist.id } });
    assert.equal(await status(therapistLink), 404);

    // The child unlinked from the parent's account: the parent's link stops too.
    await prisma.kid.update({ where: { id: w.kidA.id }, data: { parentId: null } });
    assert.equal(await status(up.url), 404);
  });

  test("a centre's template photo: that centre's staff and families only", async () => {
    const w = await world();
    const up = (await api().post("/api/media").set(bearer(w.admin.token)).send({ base64: await photo() })).body as { id: string };
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: up.id } });
    assert.equal(asset.storageKey, `media/${w.centre.id}/centre/${up.id}`);
    const linkFor = (kind: "parent" | "staff", id: string) => status(mediaPath(up.id, { kind, id }));
    assert.equal(await linkFor("parent", w.famA.parent.id), 200);
    assert.equal(await linkFor("parent", w.famB.parent.id), 200);
    assert.equal(await linkFor("staff", w.otherTherapist.user.id), 200);
    assert.equal(await linkFor("staff", w.guest.user.id), 200); // on a team at this centre
    assert.equal(await linkFor("parent", w.famC.parent.id), 404);
    assert.equal(await linkFor("staff", w.outsider.user.id), 404);
  });

  test("photos no schedule uses are deleted after 7 days (file and row); used ones stay; every step is audited", async () => {
    const w = await world();
    const used = await aaravPhoto(w);
    const unused = await aaravPhoto(w);
    const later = await aaravPhoto(w);
    await api()
      .post(`/api/parent-kids/${w.kidA.id}/visual-schedules`)
      .set(bearer(w.famA.token))
      .send({ title: "Bath", kind: "ROUTINE", steps: [{ key: randomUUID(), label: "Bath", picture: { kind: "photo", mediaId: used.id } }, { key: randomUUID(), label: "Towel" }] });

    const t0 = new Date();
    await mediaService.cleanUpUnused(t0);
    const marked = await prisma.mediaAsset.findMany({ where: { unusedSince: { not: null } }, select: { id: true } });
    assert.deepEqual(marked.map((m) => m.id).sort(), [unused.id, later.id].sort());

    // "later" gets used before the 7 days are up, so it's kept.
    await api()
      .post(`/api/parent-kids/${w.kidA.id}/visual-schedules`)
      .set(bearer(w.famA.token))
      .send({ title: "Park", kind: "ROUTINE", steps: [{ key: randomUUID(), label: "Park", picture: { kind: "photo", mediaId: later.id } }, { key: randomUUID(), label: "Home" }] });
    const unusedKey = (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: unused.id } })).storageKey;
    const r = await mediaService.cleanUpUnused(new Date(t0.getTime() + (UNUSED_DAYS + 1) * DAY));
    assert.equal(r.deleted, 1);
    assert.deepEqual((await prisma.mediaAsset.findMany({ select: { id: true } })).map((m) => m.id).sort(), [used.id, later.id].sort());
    assert.equal(await objectStorage.get(unusedKey), null);

    const events = await prisma.mediaAuditEvent.findMany({ orderBy: { createdAt: "asc" } });
    assert.deepEqual(events.filter((e) => e.action === "UPLOADED").map((e) => [e.actorKind, e.actorId, e.kidId]), Array(3).fill(["PARENT", w.famA.parent.id, w.kidA.id]));
    assert.deepEqual(events.filter((e) => e.action === "DELETED_UNUSED").map((e) => [e.mediaId, e.actorKind]), [[unused.id, "SYSTEM"]]);
  });

  test("deleting the family's account deletes the child's photos and records it", async () => {
    const w = await world();
    const up = await aaravPhoto(w);
    const key = (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: up.id } })).storageKey;
    await purgeParent(w.famA.parent.id);
    assert.equal(await objectStorage.get(key), null);
    assert.equal(await prisma.mediaAsset.count({ where: { id: up.id } }), 0);
    const e = await prisma.mediaAuditEvent.findFirstOrThrow({ where: { mediaId: up.id, action: "DELETED_WITH_ACCOUNT" } });
    assert.equal(e.actorKind, "SYSTEM");
  });
});
