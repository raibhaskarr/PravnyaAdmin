import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { makeKid, makeParent, makeRetailTenant, makeTenant, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";

// GET/POST /api/parent-kids and PATCH /api/parent-kids/:kidId. Cross-family 404s for PATCH are in
// parentKidIsolation.integration.test.ts; this file covers behaviour and validation.

const DOB = "2021-03-04T00:00:00.000Z";

async function world() {
  const retail = await makeRetailTenant();
  const tenant = await makeTenant();
  const a = await makeParent({ name: "Parent A" });
  const b = await makeParent({ name: "Parent B" });
  const { token: staffToken } = await makeUser("TENANT_ADMIN", tenant.id);
  return { retail, tenant, a, b, staffToken };
}

describe("parent kids", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  describe("GET /", () => {
    test("lists only the parent's own kids, oldest first, with the public fields", async () => {
      const w = await world();
      const first = await makeKid(w.tenant.id, w.a.parent.id, { firstName: "Alex" });
      await new Promise((r) => setTimeout(r, 5));
      const second = await makeKid(w.tenant.id, w.a.parent.id, { firstName: "Ari" });
      await makeKid(w.tenant.id, w.b.parent.id, { firstName: "Blake" });
      await makeKid(w.tenant.id, null, { firstName: "Unclaimed" });
      const res = await api().get("/api/parent-kids").set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.map((k: { id: string }) => k.id), [first.id, second.id]);
      assert.deepEqual(Object.keys(res.body[0]).sort(), ["dob", "firstName", "gender", "id", "lastName", "status"]);
      assert.equal(res.body[0].status, "ACTIVE");
    });

    test("no kids -> []", async () => {
      const w = await world();
      const res = await api().get("/api/parent-kids").set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    test("401 without a parent token", async () => {
      const w = await world();
      await expectParentAuthRequired("get", "/api/parent-kids", w.staffToken);
    });
  });

  describe("POST /", () => {
    test("creates a kid in the retail tenant owned by the caller, splitting the name", async () => {
      const w = await world();
      const res = await api().post("/api/parent-kids").set(bearer(w.a.token)).send({ name: "Maya Rose Testchild", dob: DOB, gender: "Female" });
      assert.equal(res.status, 201);
      assert.deepEqual(Object.keys(res.body).sort(), ["dob", "firstName", "gender", "id", "lastName"]);
      assert.equal(res.body.firstName, "Maya");
      assert.equal(res.body.lastName, "Rose Testchild");
      assert.equal(res.body.dob, DOB);
      assert.equal(res.body.gender, "Female");
      const row = await prisma.kid.findUniqueOrThrow({ where: { id: res.body.id } });
      assert.equal(row.tenantId, w.retail.id);
      assert.equal(row.parentId, w.a.parent.id);
      // and it shows up in the parent's lists
      const list = await api().get("/api/parent-kids").set(bearer(w.a.token));
      assert.deepEqual(list.body.map((k: { id: string }) => k.id), [res.body.id]);
      const me = await api().get("/api/parent-auth/me").set(bearer(w.a.token));
      assert.deepEqual(me.body.kids.map((k: { id: string }) => k.id), [res.body.id]);
      const other = await api().get("/api/parent-kids").set(bearer(w.b.token));
      assert.deepEqual(other.body, []);
    });

    test("a single-word name gets an empty lastName; extra whitespace is collapsed; gender defaults to null", async () => {
      const w = await world();
      const single = await api().post("/api/parent-kids").set(bearer(w.a.token)).send({ name: "Maya", dob: DOB });
      assert.equal(single.status, 201);
      assert.equal(single.body.firstName, "Maya");
      assert.equal(single.body.lastName, "");
      assert.equal(single.body.gender, null);
      const spaced = await api().post("/api/parent-kids").set(bearer(w.a.token)).send({ name: "  Maya    Rose  ", dob: DOB });
      assert.equal(spaced.body.firstName, "Maya");
      assert.equal(spaced.body.lastName, "Rose");
    });

    const badBodies: [string, object][] = [
      ["missing name", { dob: DOB }],
      ["empty name", { name: "", dob: DOB }],
      ["name over 200 chars", { name: "x".repeat(201), dob: DOB }],
      ["missing dob", { name: "Maya" }],
      ["date-only dob", { name: "Maya", dob: "2021-03-04" }],
      ["garbage dob", { name: "Maya", dob: "yesterday" }],
      ["empty gender", { name: "Maya", dob: DOB, gender: "" }],
      ["gender over 60 chars", { name: "Maya", dob: DOB, gender: "x".repeat(61) }]
    ];
    for (const [name, body] of badBodies) {
      test(`400 for ${name}; nothing written`, async () => {
        const w = await world();
        const res = await api().post("/api/parent-kids").set(bearer(w.a.token)).send(body);
        assert.equal(res.status, 400);
        assert.equal(await prisma.kid.count(), 0);
      });
    }

    test("a whitespace-only name is rejected", { todo: "BUG: name is z.string().min(1) before trimming; '   ' creates a kid with an empty firstName" }, async () => {
      const w = await world();
      const res = await api().post("/api/parent-kids").set(bearer(w.a.token)).send({ name: "   ", dob: DOB });
      assert.equal(res.status, 400, `got ${res.status} ${JSON.stringify(res.body)}`);
    });

    test("RETAIL_TENANT_ID not configured -> 500 RETAIL_TENANT_NOT_CONFIGURED; nothing written", async () => {
      const w = await world();
      const saved = env.RETAIL_TENANT_ID;
      env.RETAIL_TENANT_ID = undefined;
      try {
        const res = await api().post("/api/parent-kids").set(bearer(w.a.token)).send({ name: "Maya", dob: DOB });
        assert.equal(res.status, 500);
        assert.equal(res.body.error.code, "RETAIL_TENANT_NOT_CONFIGURED");
      } finally {
        env.RETAIL_TENANT_ID = saved;
      }
      assert.equal(await prisma.kid.count(), 0);
    });

    test("401 without a parent token; nothing written", async () => {
      const w = await world();
      await expectParentAuthRequired("post", "/api/parent-kids", w.staffToken, { name: "Maya", dob: DOB });
      assert.equal(await prisma.kid.count(), 0);
    });
  });

  describe("PATCH /:kidId", () => {
    test("each field is patchable on its own and leaves the others alone", async () => {
      const w = await world();
      const kid = await makeKid(w.tenant.id, w.a.parent.id, { firstName: "Alex" });
      const path = `/api/parent-kids/${kid.id}`;

      const therapies = await api().patch(path).set(bearer(w.a.token)).send({ selfReportedTherapies: ["Speech therapy", "ABA"] });
      assert.equal(therapies.status, 200);
      assert.deepEqual(Object.keys(therapies.body).sort(), [
        "dob",
        "firstName",
        "gender",
        "id",
        "lastName",
        "selfReportedScheduleDays",
        "selfReportedTherapies"
      ]);
      assert.deepEqual(therapies.body.selfReportedTherapies, ["Speech therapy", "ABA"]);

      const days = await api().patch(path).set(bearer(w.a.token)).send({ selfReportedScheduleDays: ["Mon", "Thu"] });
      assert.deepEqual(days.body.selfReportedScheduleDays, ["Mon", "Thu"]);
      assert.deepEqual(days.body.selfReportedTherapies, ["Speech therapy", "ABA"]);

      const gender = await api().patch(path).set(bearer(w.a.token)).send({ gender: "Male" });
      assert.equal(gender.body.gender, "Male");
      assert.deepEqual(gender.body.selfReportedScheduleDays, ["Mon", "Thu"]);

      const row = await prisma.kid.findUniqueOrThrow({ where: { id: kid.id } });
      assert.equal(row.firstName, "Alex");
      assert.equal(row.gender, "Male");
      assert.deepEqual(row.selfReportedTherapies, ["Speech therapy", "ABA"]);
    });

    test("an empty array clears a list", async () => {
      const w = await world();
      const kid = await makeKid(w.tenant.id, w.a.parent.id);
      await api().patch(`/api/parent-kids/${kid.id}`).set(bearer(w.a.token)).send({ selfReportedTherapies: ["ABA"] });
      const res = await api().patch(`/api/parent-kids/${kid.id}`).set(bearer(w.a.token)).send({ selfReportedTherapies: [] });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.selfReportedTherapies, []);
    });

    const badBodies: [string, object][] = [
      ["empty body", {}],
      ["only unknown fields", { firstName: "Renamed" }],
      ["more than 20 therapies", { selfReportedTherapies: Array.from({ length: 21 }, (_, i) => `T${i}`) }],
      ["an empty therapy", { selfReportedTherapies: [""] }],
      ["more than 7 schedule days", { selfReportedScheduleDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"] }],
      ["schedule days not an array", { selfReportedScheduleDays: "Mon" }],
      ["empty gender", { gender: "" }]
    ];
    for (const [name, body] of badBodies) {
      test(`400 for ${name}; kid unchanged`, async () => {
        const w = await world();
        const kid = await makeKid(w.tenant.id, w.a.parent.id, { firstName: "Alex" });
        const res = await api().patch(`/api/parent-kids/${kid.id}`).set(bearer(w.a.token)).send(body);
        assert.equal(res.status, 400);
        const row = await prisma.kid.findUniqueOrThrow({ where: { id: kid.id } });
        assert.equal(row.firstName, "Alex");
        assert.equal(row.gender, null);
        assert.deepEqual(row.selfReportedTherapies, []);
      });
    }

    test("400 non-uuid kid; 404 unknown kid and an unclaimed (parentless) kid", async () => {
      const w = await world();
      const unclaimed = await makeKid(w.tenant.id, null);
      assert.equal((await api().patch("/api/parent-kids/abc").set(bearer(w.a.token)).send({ gender: "Male" })).status, 400);
      assert.equal((await api().patch(`/api/parent-kids/${randomUUID()}`).set(bearer(w.a.token)).send({ gender: "Male" })).status, 404);
      assert.equal((await api().patch(`/api/parent-kids/${unclaimed.id}`).set(bearer(w.a.token)).send({ gender: "Male" })).status, 404);
      assert.equal((await prisma.kid.findUniqueOrThrow({ where: { id: unclaimed.id } })).gender, null);
    });
  });
});
