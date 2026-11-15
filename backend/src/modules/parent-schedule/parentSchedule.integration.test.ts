import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { linkTherapist, makeKid, makeParent, makeScheduleSlot, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";

// /api/parent-kids/:kidId/schedule -- a parent's weekly therapy slots for their own child.

async function world() {
  const tenant = await makeTenant();
  const a = await makeParent({ name: "Parent A" });
  const b = await makeParent({ name: "Parent B" });
  const kidA = await makeKid(tenant.id, a.parent.id, { firstName: "Alex" });
  const kidA2 = await makeKid(tenant.id, a.parent.id, { firstName: "Ari" });
  const kidB = await makeKid(tenant.id, b.parent.id, { firstName: "Blake" });
  const { therapist } = await makeTherapist(tenant.id);
  await linkTherapist(kidA.id, therapist.id);
  const { token: staffToken } = await makeUser("TENANT_ADMIN", tenant.id);
  return { tenant, a, b, kidA, kidA2, kidB, therapist, staffToken };
}

const SLOT = { label: "Speech therapy", dayOfWeek: "Mon", startTime: "16:00" } as const;

describe("parent schedule", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  describe("GET /:kidId/schedule", () => {
    test("lists only this kid's slots, Mon-first then by time, with the therapist's id and name", async () => {
      const w = await world();
      await makeScheduleSlot(w.kidA.id, { dayOfWeek: "Sun", startTime: "08:00", label: "Other" });
      await makeScheduleSlot(w.kidA.id, { dayOfWeek: "Wed", startTime: "09:00", label: "ABA", therapistId: w.therapist.id });
      await makeScheduleSlot(w.kidA.id, { dayOfWeek: "Mon", startTime: "17:00" });
      await makeScheduleSlot(w.kidA.id, { dayOfWeek: "Mon", startTime: "09:30" });
      await makeScheduleSlot(w.kidA2.id, { dayOfWeek: "Tue", startTime: "10:00" }); // same parent, other kid
      await makeScheduleSlot(w.kidB.id, { dayOfWeek: "Tue", startTime: "11:00" }); // other family

      const res = await api().get(`/api/parent-kids/${w.kidA.id}/schedule`).set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((s: { dayOfWeek: string; startTime: string }) => `${s.dayOfWeek} ${s.startTime}`),
        ["Mon 09:30", "Mon 17:00", "Wed 09:00", "Sun 08:00"]
      );
      const wed = res.body[2];
      assert.equal(wed.label, "ABA");
      assert.equal(wed.kidId, w.kidA.id);
      assert.deepEqual(wed.therapist, { id: w.therapist.id, name: w.therapist.name });
      assert.equal(res.body[0].therapist, null);
    });

    test("empty schedule is an empty array", async () => {
      const w = await world();
      const res = await api().get(`/api/parent-kids/${w.kidA.id}/schedule`).set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    test("400 for a non-uuid kidId, 404 for an unknown or other family's kid, 401 without a parent token", async () => {
      const w = await world();
      assert.equal((await api().get(`/api/parent-kids/not-a-uuid/schedule`).set(bearer(w.a.token))).status, 400);
      assert.equal((await api().get(`/api/parent-kids/${randomUUID()}/schedule`).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().get(`/api/parent-kids/${w.kidB.id}/schedule`).set(bearer(w.a.token))).status, 404);
      await expectParentAuthRequired("get", `/api/parent-kids/${w.kidA.id}/schedule`, w.staffToken);
    });
  });

  describe("POST /:kidId/schedule", () => {
    test("creates a slot without a therapist", async () => {
      const w = await world();
      const res = await api().post(`/api/parent-kids/${w.kidA.id}/schedule`).set(bearer(w.a.token)).send(SLOT);
      assert.equal(res.status, 201);
      assert.equal(res.body.kidId, w.kidA.id);
      assert.equal(res.body.label, "Speech therapy");
      assert.equal(res.body.dayOfWeek, "Mon");
      assert.equal(res.body.startTime, "16:00");
      assert.equal(res.body.therapistId, null);
      assert.equal(res.body.therapist, null);
      const row = await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: res.body.id } });
      assert.equal(row.kidId, w.kidA.id);
    });

    test("creates a slot with a therapist linked to this kid", async () => {
      const w = await world();
      const res = await api()
        .post(`/api/parent-kids/${w.kidA.id}/schedule`)
        .set(bearer(w.a.token))
        .send({ ...SLOT, therapistId: w.therapist.id });
      assert.equal(res.status, 201);
      assert.equal(res.body.therapistId, w.therapist.id);
      assert.deepEqual(res.body.therapist, { id: w.therapist.id, name: w.therapist.name });
    });

    test("same day+time as an existing slot -> 409, regardless of label; nothing written", async () => {
      const w = await world();
      await makeScheduleSlot(w.kidA.id, { dayOfWeek: "Mon", startTime: "16:00", label: "ABA" });
      const res = await api().post(`/api/parent-kids/${w.kidA.id}/schedule`).set(bearer(w.a.token)).send(SLOT);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "CONFLICT");
      assert.match(res.body.error.message, /Mon at 16:00/);
      assert.equal(await prisma.scheduleSlot.count({ where: { kidId: w.kidA.id } }), 1);
    });

    test("the clash check is per kid: another kid's identical slot doesn't block it", async () => {
      const w = await world();
      await makeScheduleSlot(w.kidA2.id, { dayOfWeek: "Mon", startTime: "16:00" });
      await makeScheduleSlot(w.kidB.id, { dayOfWeek: "Mon", startTime: "16:00" });
      const res = await api().post(`/api/parent-kids/${w.kidA.id}/schedule`).set(bearer(w.a.token)).send(SLOT);
      assert.equal(res.status, 201);
    });

    test("a real therapist who isn't on this kid's care team -> 404; nothing written", async () => {
      const w = await world();
      const { therapist: stranger } = await makeTherapist(w.tenant.id);
      const { therapist: siblingsTherapist } = await makeTherapist(w.tenant.id);
      await linkTherapist(w.kidA2.id, siblingsTherapist.id);
      for (const therapistId of [stranger.id, siblingsTherapist.id, randomUUID()]) {
        const res = await api()
          .post(`/api/parent-kids/${w.kidA.id}/schedule`)
          .set(bearer(w.a.token))
          .send({ ...SLOT, therapistId });
        assert.equal(res.status, 404, `therapistId ${therapistId}`);
        assert.match(res.body.error.message, /care team/);
      }
      assert.equal(await prisma.scheduleSlot.count(), 0);
    });

    const badBodies: [string, object][] = [
      ["unknown label", { ...SLOT, label: "Music therapy" }],
      ["lower-case day", { ...SLOT, dayOfWeek: "mon" }],
      ["full day name", { ...SLOT, dayOfWeek: "Monday" }],
      ["time without leading zero", { ...SLOT, startTime: "9:00" }],
      ["hour 24", { ...SLOT, startTime: "24:00" }],
      ["minute 60", { ...SLOT, startTime: "16:60" }],
      ["12-hour time", { ...SLOT, startTime: "4:00 PM" }],
      ["non-uuid therapistId", { ...SLOT, therapistId: "abc" }],
      ["missing label", { dayOfWeek: "Mon", startTime: "16:00" }],
      ["missing day", { label: "ABA", startTime: "16:00" }],
      ["missing time", { label: "ABA", dayOfWeek: "Mon" }],
      ["empty body", {}]
    ];
    for (const [name, body] of badBodies) {
      test(`400 for ${name}; nothing written`, async () => {
        const w = await world();
        const res = await api().post(`/api/parent-kids/${w.kidA.id}/schedule`).set(bearer(w.a.token)).send(body);
        assert.equal(res.status, 400);
        assert.equal(res.body.error.code, "VALIDATION_ERROR");
        assert.equal(await prisma.scheduleSlot.count(), 0);
      });
    }

    test("400 non-uuid kidId; 404 other family's kid (nothing written); 401 without a parent token", async () => {
      const w = await world();
      assert.equal((await api().post(`/api/parent-kids/nope/schedule`).set(bearer(w.a.token)).send(SLOT)).status, 400);
      assert.equal((await api().post(`/api/parent-kids/${w.kidB.id}/schedule`).set(bearer(w.a.token)).send(SLOT)).status, 404);
      assert.equal(await prisma.scheduleSlot.count(), 0);
      await expectParentAuthRequired("post", `/api/parent-kids/${w.kidA.id}/schedule`, w.staffToken, SLOT);
      assert.equal(await prisma.scheduleSlot.count(), 0);
    });
  });

  describe("PATCH /:kidId/schedule/:slotId", () => {
    test("full replace: every field updated; omitting therapistId clears it", async () => {
      const w = await world();
      const slot = await makeScheduleSlot(w.kidA.id, { therapistId: w.therapist.id });
      const res = await api()
        .patch(`/api/parent-kids/${w.kidA.id}/schedule/${slot.id}`)
        .set(bearer(w.a.token))
        .send({ label: "Occupational therapy", dayOfWeek: "Thu", startTime: "07:45" });
      assert.equal(res.status, 200);
      assert.equal(res.body.id, slot.id);
      assert.equal(res.body.label, "Occupational therapy");
      assert.equal(res.body.dayOfWeek, "Thu");
      assert.equal(res.body.startTime, "07:45");
      assert.equal(res.body.therapistId, null);
      assert.equal(res.body.therapist, null);
      const row = await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: slot.id } });
      assert.equal(row.therapistId, null);
      assert.equal(row.dayOfWeek, "Thu");
    });

    test("can set a linked therapist, and saving the slot's own unchanged day/time isn't a clash", async () => {
      const w = await world();
      const slot = await makeScheduleSlot(w.kidA.id);
      const res = await api()
        .patch(`/api/parent-kids/${w.kidA.id}/schedule/${slot.id}`)
        .set(bearer(w.a.token))
        .send({ ...SLOT, label: "ABA", therapistId: w.therapist.id });
      assert.equal(res.status, 200);
      assert.equal(res.body.label, "ABA");
      assert.deepEqual(res.body.therapist, { id: w.therapist.id, name: w.therapist.name });
    });

    test("moving onto another slot's day+time -> 409; slot unchanged", async () => {
      const w = await world();
      await makeScheduleSlot(w.kidA.id, { dayOfWeek: "Tue", startTime: "10:00" });
      const slot = await makeScheduleSlot(w.kidA.id);
      const res = await api()
        .patch(`/api/parent-kids/${w.kidA.id}/schedule/${slot.id}`)
        .set(bearer(w.a.token))
        .send({ ...SLOT, dayOfWeek: "Tue", startTime: "10:00" });
      assert.equal(res.status, 409);
      const row = await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: slot.id } });
      assert.equal(row.dayOfWeek, "Mon");
    });

    test("therapist not on this kid's care team -> 404; slot unchanged", async () => {
      const w = await world();
      const { therapist: stranger } = await makeTherapist(w.tenant.id);
      const slot = await makeScheduleSlot(w.kidA.id);
      const res = await api()
        .patch(`/api/parent-kids/${w.kidA.id}/schedule/${slot.id}`)
        .set(bearer(w.a.token))
        .send({ ...SLOT, label: "ABA", therapistId: stranger.id });
      assert.equal(res.status, 404);
      const row = await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: slot.id } });
      assert.equal(row.label, "Speech therapy");
      assert.equal(row.therapistId, null);
    });

    test("a slotId belonging to another family's kid -> 404 even under the parent's own kidId; that slot untouched", async () => {
      const w = await world();
      const foreign = await makeScheduleSlot(w.kidB.id);
      const res = await api()
        .patch(`/api/parent-kids/${w.kidA.id}/schedule/${foreign.id}`)
        .set(bearer(w.a.token))
        .send({ ...SLOT, label: "Other", dayOfWeek: "Sat" });
      assert.equal(res.status, 404);
      const row = await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: foreign.id } });
      assert.equal(row.label, "Speech therapy");
      assert.equal(row.dayOfWeek, "Mon");
    });

    test("a slotId belonging to the same parent's other kid -> 404 (the URL kid must match)", async () => {
      const w = await world();
      const siblingSlot = await makeScheduleSlot(w.kidA2.id);
      const res = await api()
        .patch(`/api/parent-kids/${w.kidA.id}/schedule/${siblingSlot.id}`)
        .set(bearer(w.a.token))
        .send({ ...SLOT, dayOfWeek: "Sat" });
      assert.equal(res.status, 404);
      assert.equal((await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: siblingSlot.id } })).dayOfWeek, "Mon");
    });

    test("404 for an unknown slot and for another family's kid in the URL", async () => {
      const w = await world();
      const bSlot = await makeScheduleSlot(w.kidB.id);
      assert.equal(
        (await api().patch(`/api/parent-kids/${w.kidA.id}/schedule/${randomUUID()}`).set(bearer(w.a.token)).send(SLOT)).status,
        404
      );
      const res = await api()
        .patch(`/api/parent-kids/${w.kidB.id}/schedule/${bSlot.id}`)
        .set(bearer(w.a.token))
        .send({ ...SLOT, dayOfWeek: "Sat" });
      assert.equal(res.status, 404);
      assert.equal((await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: bSlot.id } })).dayOfWeek, "Mon");
    });

    test("400 for non-uuid slotId/kidId, a partial body, or invalid fields", async () => {
      const w = await world();
      const slot = await makeScheduleSlot(w.kidA.id);
      const base = `/api/parent-kids/${w.kidA.id}/schedule`;
      assert.equal((await api().patch(`${base}/not-a-uuid`).set(bearer(w.a.token)).send(SLOT)).status, 400);
      assert.equal((await api().patch(`/api/parent-kids/x/schedule/${slot.id}`).set(bearer(w.a.token)).send(SLOT)).status, 400);
      // Full-replace contract: a partial body is rejected, not merged.
      assert.equal((await api().patch(`${base}/${slot.id}`).set(bearer(w.a.token)).send({ label: "ABA" })).status, 400);
      assert.equal((await api().patch(`${base}/${slot.id}`).set(bearer(w.a.token)).send({ ...SLOT, startTime: "25:00" })).status, 400);
      assert.equal((await api().patch(`${base}/${slot.id}`).set(bearer(w.a.token)).send({ ...SLOT, dayOfWeek: "Funday" })).status, 400);
      assert.equal((await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: slot.id } })).label, "Speech therapy");
    });

    test("401 without a parent token", async () => {
      const w = await world();
      const slot = await makeScheduleSlot(w.kidA.id);
      await expectParentAuthRequired("patch", `/api/parent-kids/${w.kidA.id}/schedule/${slot.id}`, w.staffToken, { ...SLOT, label: "ABA" });
      assert.equal((await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: slot.id } })).label, "Speech therapy");
    });
  });

  describe("DELETE /:kidId/schedule/:slotId", () => {
    test("204 and the row is gone; deleting again is 404", async () => {
      const w = await world();
      const slot = await makeScheduleSlot(w.kidA.id);
      const keep = await makeScheduleSlot(w.kidA.id, { dayOfWeek: "Tue" });
      const res = await api().delete(`/api/parent-kids/${w.kidA.id}/schedule/${slot.id}`).set(bearer(w.a.token));
      assert.equal(res.status, 204);
      assert.equal(await prisma.scheduleSlot.findUnique({ where: { id: slot.id } }), null);
      assert.ok(await prisma.scheduleSlot.findUnique({ where: { id: keep.id } }));
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/schedule/${slot.id}`).set(bearer(w.a.token))).status, 404);
    });

    test("another family's slotId under the parent's own kidId -> 404, and it still exists", async () => {
      const w = await world();
      const foreign = await makeScheduleSlot(w.kidB.id);
      const sibling = await makeScheduleSlot(w.kidA2.id);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/schedule/${foreign.id}`).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/schedule/${sibling.id}`).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidB.id}/schedule/${foreign.id}`).set(bearer(w.a.token))).status, 404);
      assert.equal(await prisma.scheduleSlot.count(), 2);
    });

    test("400 for non-uuid ids; 401 without a parent token (row survives)", async () => {
      const w = await world();
      const slot = await makeScheduleSlot(w.kidA.id);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/schedule/nope`).set(bearer(w.a.token))).status, 400);
      assert.equal((await api().delete(`/api/parent-kids/nope/schedule/${slot.id}`).set(bearer(w.a.token))).status, 400);
      await expectParentAuthRequired("delete", `/api/parent-kids/${w.kidA.id}/schedule/${slot.id}`, w.staffToken);
      assert.ok(await prisma.scheduleSlot.findUnique({ where: { id: slot.id } }));
    });
  });
});
