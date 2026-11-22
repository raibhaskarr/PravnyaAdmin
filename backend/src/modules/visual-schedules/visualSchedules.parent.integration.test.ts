import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { linkTherapist, makeKid, makeParent, makeTenant, makeTherapist } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";
import { testPushOutbox } from "../push/push.service";
import { runScheduleReminders } from "./visualSchedules.reminders";
import { purgeParent } from "../parent-account/parentAccount.purge";

// The parent makes their own picture schedules (Pravnya drafts them from what they type or say),
// the app learns when each one is usually done, shows it on Home then and sends a reminder.

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

async function world() {
  const tenant = await makeTenant({ name: "Sunrise Centre" });
  const fam = await makeParent({ name: "Maya" });
  const kid = await makeKid(tenant.id, fam.parent.id, { firstName: "Aarav" });
  const linked = await makeTherapist(tenant.id);
  await linkTherapist(kid.id, linked.therapist.id);
  const other = await makeParent({ name: "Other" });
  return { tenant, fam, kid, linked, other };
}
type W = Awaited<ReturnType<typeof world>>;

const url = (w: W, path = "") => `/api/parent-kids/${w.kid.id}/visual-schedules${path}`;
const step = (label: string, picture: unknown = { kind: "symbol", symbolId: "toilet" }) => ({ key: randomUUID(), label, picture });

const aiDraft = {
  title: "Bath time",
  kind: "ROUTINE",
  time: "19:30",
  days: [],
  steps: [
    { label: "Clothes off", say: null, symbolSearch: "get undressed", minutes: null },
    { label: "Bath", say: null, symbolSearch: "bath", minutes: 10 },
    { label: "Towel", say: null, symbolSearch: "towel", minutes: null }
  ]
};

async function parentSchedule(w: W, over: Record<string, unknown> = {}) {
  const res = await api().post(url(w)).set(bearer(w.fam.token)).send({ title: "Park", kind: "ROUTINE", steps: [step("Shoes"), step("Park")], ...over });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

/** The id of a built-in Pravnya template, e.g. "bedtime:en". */
async function builtIn(token: string, key: string): Promise<string> {
  const list = (await api().get("/api/schedule-templates").set(bearer(token))).body as { id: string; builtInKey: string | null }[];
  const t = list.find((x) => x.builtInKey === key);
  if (!t) throw new Error(`no template ${key}`);
  return t.id;
}

describe("visual schedules: parents", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("Pravnya drafts from what the parent typed: kind, time and pictures picked; nothing is saved until they save it", async () => {
    const w = await world();
    setTestAiResponse("visual-schedule-parent-draft", aiDraft);
    const res = await api().post(url(w, "/draft")).set(bearer(w.fam.token)).send({ text: "bath time every evening at 7:30" });
    assert.equal(res.status, 200);
    assert.equal(res.body.kind, "ROUTINE");
    assert.equal(res.body.time, "19:30");
    assert.match(res.body.steps[1].picture.url, /bath\.svg$/);
    assert.equal(await prisma.visualSchedule.count(), 0);

    // Voice works the same way (the audio goes to the AI, never stored).
    const voice = await api().post(url(w, "/draft")).set(bearer(w.fam.token)).send({ audio: { mimeType: "audio/webm", base64: Buffer.from("fake").toString("base64") } });
    assert.equal(voice.status, 200);

    const unavailable = await api().post(url(w, "/draft")).set(bearer(w.fam.token)).send({ text: "something", kind: "FIRST_THEN" });
    assert.equal(unavailable.status, 503);
    assert.equal((await api().post(url(w, "/draft")).set(bearer(w.fam.token)).send({})).status, 400);
  });

  test("the parent saves, edits and deletes their own; it's live at once and the therapist sees it, read-only", async () => {
    const w = await world();
    const photo = (await api().post(`/api/parent-kids/${w.kid.id}/media`).set(bearer(w.fam.token)).send({ base64: PNG.toString("base64") })).body;
    assert.ok(photo.id);
    const sym = await api().get(`/api/parent-kids/${w.kid.id}/symbols?q=bath`).set(bearer(w.fam.token));
    assert.equal(sym.body.symbols[0].id, "bath");

    const made = await parentSchedule(w, { time: "19:30", steps: [step("Bath", { kind: "photo", mediaId: photo.id }), step("Towel")] });
    assert.equal(made.mine, true);
    assert.equal(made.source, "PARENT");
    assert.equal(made.authorName, "Maya");
    assert.match(made.steps[0].picture.url, /^\/api\/media\//);

    const staff = (await api().get(`/api/visual-schedules?kidId=${w.kid.id}`).set(bearer(w.linked.token))).body;
    assert.equal(staff[0].source, "PARENT");
    assert.equal(staff[0].status, "ACTIVE");
    assert.equal((await api().patch(`/api/visual-schedules/${made.id}`).set(bearer(w.linked.token)).send({ title: "x" })).body.error.code, "MADE_BY_PARENT");

    const edited = await api().patch(url(w, `/${made.id}`)).set(bearer(w.fam.token)).send({ title: "Bath time", remind: false });
    assert.equal(edited.body.title, "Bath time");
    assert.equal(edited.body.remind, false);

    assert.equal((await api().delete(url(w, `/${made.id}`)).set(bearer(w.other.token))).status, 404);
    assert.equal((await api().delete(url(w, `/${made.id}`)).set(bearer(w.fam.token))).status, 204);
    assert.equal(await prisma.visualSchedule.count(), 0);
  });

  test("on a therapist's schedule the parent may set only the time and reminder", async () => {
    const w = await world();
    const t = (await api().post("/api/visual-schedules/from-template").set(bearer(w.linked.token)).send({ kidId: w.kid.id, templateId: await builtIn(w.linked.token, "bedtime:en") })).body;
    await api().post(`/api/visual-schedules/${t.id}/publish`).set(bearer(w.linked.token));
    const list = (await api().get(url(w)).set(bearer(w.fam.token))).body.schedules;
    assert.equal(list[0].mine, false);

    const timed = await api().patch(url(w, `/${t.id}`)).set(bearer(w.fam.token)).send({ time: "20:30" });
    assert.equal(timed.status, 200);
    assert.deepEqual(timed.body.timing, { time: "20:30", days: [], source: "set" });
    const renamed = await api().patch(url(w, `/${t.id}`)).set(bearer(w.fam.token)).send({ title: "Mine now" });
    assert.equal(renamed.body.error.code, "MADE_BY_THERAPIST");
    assert.equal((await api().delete(url(w, `/${t.id}`)).set(bearer(w.fam.token))).status, 409);
    // The therapist sees the family's time.
    const staff = (await api().get(`/api/visual-schedules?kidId=${w.kid.id}`).set(bearer(w.linked.token))).body;
    assert.equal(staff[0].timing.time, "20:30");
  });

  test("uses are recorded; after 3 days the usual time is learned and it shows as 'now' then", async () => {
    const w = await world();
    const s = await parentSchedule(w);
    // Three mornings at about 07:30 India time (02:00Z).
    const days = [3, 2, 1].map((n) => new Date(Date.now() - n * 86_400_000));
    for (const d of days) {
      d.setUTCHours(2, 0, 0, 0);
      await prisma.visualScheduleUse.create({ data: { scheduleId: s.id, startedAt: d, completedAt: d } });
    }
    const { visualSchedulesService } = await import("./visualSchedules.service");
    const now = new Date();
    now.setUTCHours(1, 50, 0, 0); // 07:20 IST
    const res = await visualSchedulesService.listForParent(w.fam.parent.id, w.kid.id, now);
    assert.deepEqual(res.schedules[0].timing, { time: "07:30", days: [], source: "learned" });
    assert.equal(res.schedules[0].dueNow, true);

    // Opening it twice within minutes is one use; finishing marks it done for today.
    const r1 = await api().post(url(w, `/${s.id}/uses`)).set(bearer(w.fam.token)).send({ event: "start" });
    assert.equal(r1.status, 200);
    await api().post(url(w, `/${s.id}/uses`)).set(bearer(w.fam.token)).send({ event: "start" });
    await api().post(url(w, `/${s.id}/uses`)).set(bearer(w.fam.token)).send({ event: "complete" });
    const uses = await prisma.visualScheduleUse.findMany({ where: { scheduleId: s.id }, orderBy: { startedAt: "desc" } });
    assert.equal(uses.length, 4);
    assert.ok(uses[0].completedAt);
    const after = (await api().get(url(w)).set(bearer(w.fam.token))).body.schedules[0];
    assert.equal(after.doneToday, true);
    assert.equal(after.dueNow, false);
  });

  test("push: the parent registers a device; reminders go out once, shortly before the time, not if already started or switched off", async () => {
    const w = await world();
    await expectParentAuthRequired("get", "/api/parent-push", w.linked.token);
    const key = await api().get("/api/parent-push").set(bearer(w.fam.token));
    assert.equal(key.status, 200);
    assert.ok("publicKey" in key.body);
    const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "BPk", auth: "xyz" } };
    assert.equal((await api().post("/api/parent-push/subscriptions").set(bearer(w.fam.token)).send({ ...sub, endpoint: "http://insecure" })).status, 400);
    assert.equal((await api().post("/api/parent-push/subscriptions").set(bearer(w.fam.token)).send(sub)).status, 204);

    const due = await parentSchedule(w, { title: "Morning", time: "07:30" });
    await parentSchedule(w, { title: "Off", time: "07:30", remind: false });
    await parentSchedule(w, { title: "Later", time: "12:00" });
    const started = await parentSchedule(w, { title: "Started", time: "07:30" });

    const now = new Date();
    now.setUTCHours(1, 50, 0, 0); // 07:20 IST
    await prisma.visualScheduleUse.create({ data: { scheduleId: started.id, startedAt: new Date(now.getTime() - 5 * 60_000) } });

    testPushOutbox.length = 0;
    const r = await runScheduleReminders(now);
    assert.equal(r.sent, 1);
    assert.equal(testPushOutbox.length, 1);
    assert.equal(testPushOutbox[0].message.title, "Time for Morning");
    assert.equal(testPushOutbox[0].message.body, "Open Aarav's picture schedule");
    assert.equal(testPushOutbox[0].message.url, `/?kid=${w.kid.id}&schedule=${due.id}`);
    // Once a day.
    await runScheduleReminders(new Date(now.getTime() + 5 * 60_000));
    assert.equal(testPushOutbox.length, 1);

    // Unsubscribed: nothing more is checked.
    await api().delete("/api/parent-push/subscriptions").set(bearer(w.fam.token)).send({ endpoint: sub.endpoint });
    assert.equal((await runScheduleReminders(now)).checked, 0);
  });

  test("deleting the parent's account removes their schedules and photos on a centre's child; the centre's stay", async () => {
    const w = await world();
    const photo = (await api().post(`/api/parent-kids/${w.kid.id}/media`).set(bearer(w.fam.token)).send({ base64: PNG.toString("base64") })).body;
    await parentSchedule(w, { steps: [step("Bath", { kind: "photo", mediaId: photo.id }), step("Towel")] });
    const t = (await api().post("/api/visual-schedules/from-template").set(bearer(w.linked.token)).send({ kidId: w.kid.id, templateId: await builtIn(w.linked.token, "bedtime:en") })).body;
    const staffPhoto = (await api().post("/api/media").set(bearer(w.linked.token)).send({ kidId: w.kid.id, base64: PNG.toString("base64") })).body;
    await purgeParent(w.fam.parent.id);
    assert.deepEqual((await prisma.visualSchedule.findMany()).map((s) => s.id), [t.id]);
    assert.deepEqual((await prisma.mediaAsset.findMany()).map((m) => m.id), [staffPhoto.id]);
  });
});
