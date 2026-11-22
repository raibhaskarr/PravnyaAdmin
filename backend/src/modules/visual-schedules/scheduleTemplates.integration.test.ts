import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { linkTherapist, makeKid, makeParent, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";
import { TEMPLATES } from "./visualSchedules.templates";

// Templates: Pravnya's (built in, plus a superadmin's) and each centre's own. Starting from one
// gives a copy to change; templates never carry a child's photos.

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const step = (label: string, picture: unknown = { kind: "symbol", symbolId: "toilet" }) => ({ key: randomUUID(), label, picture });
type T = { id: string; title: string; scope: string; builtIn: boolean; canEdit: boolean; language: string; steps: { label: string; picture: { kind: string; url: string } | null }[] };

async function world() {
  const tenant = await makeTenant({ name: "Sunrise Centre" });
  const otherTenant = await makeTenant({ name: "Elsewhere" });
  const admin = await makeUser("TENANT_ADMIN", tenant.id);
  const t1 = await makeTherapist(tenant.id);
  const t2 = await makeTherapist(tenant.id);
  const viewer = await makeUser("VIEWER", tenant.id);
  const outsider = await makeUser("TENANT_ADMIN", otherTenant.id);
  const superadmin = await makeUser("SUPERADMIN", null);
  const fam = await makeParent({ name: "Maya" });
  const kid = await makeKid(tenant.id, fam.parent.id, { firstName: "Aarav" });
  await linkTherapist(kid.id, t1.therapist.id);
  return { tenant, admin, t1, t2, viewer, outsider, superadmin, fam, kid };
}

const list = async (token: string, q = "") => (await api().get(`/api/schedule-templates${q}`).set(bearer(token))).body as T[];

describe("schedule templates", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("Pravnya's built-in templates appear once, in English and Hindi, for everyone; only a superadmin may change them", async () => {
    const w = await world();
    const en = await list(w.t1.token, "?language=en");
    assert.equal(en.length, TEMPLATES.length);
    assert.ok(en.every((t) => t.scope === "PRAVNYA" && t.builtIn && !t.canEdit));
    assert.equal((await list(w.t1.token)).length, TEMPLATES.length * 2);
    // Listing again doesn't duplicate them.
    await list(w.admin.token);
    assert.equal(await prisma.visualScheduleTemplate.count(), TEMPLATES.length * 2);

    const bedtime = en.find((t) => t.title === "Bedtime")!;
    assert.equal((await api().patch(`/api/schedule-templates/${bedtime.id}`).set(bearer(w.admin.token)).send({ title: "x" })).status, 403);
    const sa = await list(w.superadmin.token, "?language=en");
    assert.ok(sa.every((t) => t.canEdit));
    const renamed = await api().patch(`/api/schedule-templates/${bedtime.id}`).set(bearer(w.superadmin.token)).send({ title: "Going to bed" });
    assert.equal(renamed.body.title, "Going to bed");

    // Deleting a built-in hides it for good (it isn't re-created).
    assert.equal((await api().delete(`/api/schedule-templates/${bedtime.id}`).set(bearer(w.superadmin.token))).status, 204);
    assert.equal((await list(w.t1.token, "?language=en")).length, TEMPLATES.length - 1);

    // A superadmin's new template is Pravnya's, symbols only.
    const mine = await api().post("/api/schedule-templates").set(bearer(w.superadmin.token)).send({ title: "Haircut", kind: "ROUTINE", steps: [step("Sit"), step("Cut")] });
    assert.equal(mine.status, 201);
    assert.equal(mine.body.scope, "PRAVNYA");
    assert.equal(mine.body.createdByName, "Pravnya");
    assert.ok((await list(w.outsider.token)).some((t) => t.title === "Haircut"));
  });

  test("a centre's templates: staff make them (photos included), only their centre sees them; admins edit any, therapists their own, viewers none", async () => {
    const w = await world();
    const photo = await api().post("/api/media").set(bearer(w.t1.token)).send({ base64: PNG.toString("base64") });
    assert.equal(photo.status, 201);
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: photo.body.id } });
    assert.equal(asset.kidId, null);
    assert.equal(asset.tenantId, w.tenant.id);

    const made = await api().post("/api/schedule-templates").set(bearer(w.t1.token)).send({ title: "Our hello song", kind: "ROUTINE", steps: [step("Wave", { kind: "photo", mediaId: photo.body.id }), step("Sing")] });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.scope, "CENTRE");

    // A child's photo can't go in a template.
    const kidPhoto = (await api().post("/api/media").set(bearer(w.t1.token)).send({ kidId: w.kid.id, base64: PNG.toString("base64") })).body;
    assert.equal((await api().post("/api/schedule-templates").set(bearer(w.t1.token)).send({ title: "x", kind: "ROUTINE", steps: [step("a", { kind: "photo", mediaId: kidPhoto.id }), step("b")] })).status, 400);
    // Nor any photo in Pravnya's.
    assert.equal((await api().post("/api/schedule-templates").set(bearer(w.superadmin.token)).send({ title: "x", kind: "ROUTINE", steps: [step("a", { kind: "photo", mediaId: photo.body.id }), step("b")] })).status, 400);

    const centre = (await list(w.t2.token)).filter((t) => t.scope === "CENTRE");
    assert.deepEqual(centre.map((t) => [t.title, t.canEdit]), [["Our hello song", false]]);
    assert.ok(!(await list(w.outsider.token)).some((t) => t.title === "Our hello song"));
    assert.equal((await api().patch(`/api/schedule-templates/${made.body.id}`).set(bearer(w.t2.token)).send({ title: "x" })).status, 403);
    assert.equal((await api().patch(`/api/schedule-templates/${made.body.id}`).set(bearer(w.admin.token)).send({ title: "Hello song" })).status, 200);
    assert.equal((await api().post("/api/schedule-templates").set(bearer(w.viewer.token)).send({ title: "x", kind: "ROUTINE", steps: [step("a"), step("b")] })).status, 403);
    assert.equal((await api().delete(`/api/schedule-templates/${made.body.id}`).set(bearer(w.t1.token))).status, 204);
    assert.equal(await prisma.visualScheduleTemplate.count({ where: { tenantId: w.tenant.id } }), 0);
  });

  test("a child's schedule from a centre template is a copy with the centre's photos; changing it leaves the template alone", async () => {
    const w = await world();
    const photo = (await api().post("/api/media").set(bearer(w.admin.token)).send({ base64: PNG.toString("base64") })).body;
    const tpl = (await api().post("/api/schedule-templates").set(bearer(w.admin.token)).send({ title: "Circle time", kind: "ROUTINE", time: "10:00", steps: [step("Sit", { kind: "photo", mediaId: photo.id }), step("Sing")] })).body;

    const s = await api().post("/api/visual-schedules/from-template").set(bearer(w.t1.token)).send({ kidId: w.kid.id, templateId: tpl.id });
    assert.equal(s.status, 201);
    assert.equal(s.body.title, "Circle time");
    assert.equal(s.body.time, "10:00");
    assert.equal(s.body.steps[0].picture.kind, "photo");
    // The therapist swaps the photo for a symbol on this child's copy.
    const swapped = await api().patch(`/api/visual-schedules/${s.body.id}`).set(bearer(w.t1.token)).send({ steps: [step("Sit", { kind: "symbol", symbolId: "sit_,_to" }), step("Sing")] });
    assert.equal(swapped.status, 200);
    const again = (await list(w.t1.token)).find((t) => t.id === tpl.id)!;
    assert.equal(again.steps[0].picture!.kind, "photo");

    // Another centre's template can't be used.
    const theirs = (await api().post("/api/schedule-templates").set(bearer(w.outsider.token)).send({ title: "Theirs", kind: "ROUTINE", steps: [step("a"), step("b")] })).body;
    assert.equal((await api().post("/api/visual-schedules/from-template").set(bearer(w.t1.token)).send({ kidId: w.kid.id, templateId: theirs.id })).status, 404);
  });

  test("save a child's schedule as a centre template: the child's own photos are left out", async () => {
    const w = await world();
    const kidPhoto = (await api().post("/api/media").set(bearer(w.t1.token)).send({ kidId: w.kid.id, base64: PNG.toString("base64") })).body;
    const sched = (await api().post("/api/visual-schedules").set(bearer(w.t1.token)).send({ kidId: w.kid.id, title: "Aarav's park trip", kind: "ROUTINE", steps: [step("Shoes", { kind: "photo", mediaId: kidPhoto.id }), step("Park")] })).body;
    const res = await api().post(`/api/schedule-templates/from-schedule/${sched.id}`).set(bearer(w.t1.token)).send({ title: "Park trip" });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, "Park trip");
    assert.equal(res.body.scope, "CENTRE");
    assert.equal(res.body.droppedPhotos, 1);
    assert.equal(res.body.steps[0].picture, null);
    assert.equal((await api().post(`/api/schedule-templates/from-schedule/${sched.id}`).set(bearer(w.outsider.token)).send({})).status, 403);
  });

  test("AI drafts a template; parents see Pravnya's and their child's centre's templates", async () => {
    const w = await world();
    setTestAiResponse("schedule-template-draft", { title: "Haircut", kind: "ROUTINE", time: null, days: [], steps: [{ label: "Sit", say: null, symbolSearch: "sit", minutes: null }, { label: "Cut", say: null, symbolSearch: "haircut", minutes: null }] });
    const d = await api().post("/api/schedule-templates/draft").set(bearer(w.admin.token)).send({ request: "getting a haircut" });
    assert.equal(d.status, 201);
    assert.equal(d.body.scope, "CENTRE");

    const parent = (await api().get(`/api/parent-kids/${w.kid.id}/schedule-templates?language=en`).set(bearer(w.fam.token))).body as T[];
    assert.equal(parent.length, TEMPLATES.length + 1);
    assert.equal(parent[0].title, "Haircut");
    assert.ok(parent.every((t) => !t.canEdit));
    assert.equal((await api().get(`/api/parent-kids/${w.kid.id}/schedule-templates`).set(bearer(w.t1.token))).status, 401);
  });
});
