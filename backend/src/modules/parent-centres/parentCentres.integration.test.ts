import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { makeCentre, makeParent, makeTenant, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";

// /api/parent-centres -- the shared (not per-family) directory of therapy centres.

async function world() {
  const tenant = await makeTenant();
  const a = await makeParent();
  const { token: staffToken } = await makeUser("TENANT_ADMIN", tenant.id);
  return { a, staffToken };
}

describe("parent centres", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("GET lists every centre, sorted by name", async () => {
    const w = await world();
    await makeCentre({ name: "Sunrise Therapy", city: "Pune" });
    await makeCentre({ name: "Apple Tree Clinic" });
    const res = await api().get("/api/parent-centres").set(bearer(w.a.token));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((c: { name: string }) => c.name), ["Apple Tree Clinic", "Sunrise Therapy"]);
    assert.equal(res.body[1].city, "Pune");
    assert.ok(res.body[1].id);
  });

  test("GET with no centres -> []", async () => {
    const w = await world();
    const res = await api().get("/api/parent-centres").set(bearer(w.a.token));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test("POST creates a centre (city optional) visible to every parent", async () => {
    const w = await world();
    const withCity = await api().post("/api/parent-centres").set(bearer(w.a.token)).send({ name: "Sunrise Therapy", city: "Pune" });
    assert.equal(withCity.status, 201);
    assert.equal(withCity.body.name, "Sunrise Therapy");
    assert.equal(withCity.body.city, "Pune");
    const noCity = await api().post("/api/parent-centres").set(bearer(w.a.token)).send({ name: "Apple Tree Clinic" });
    assert.equal(noCity.status, 201);
    assert.equal(noCity.body.city, null);
    const other = await makeParent();
    const list = await api().get("/api/parent-centres").set(bearer(other.token));
    assert.equal(list.body.length, 2);
  });

  test("POST with an existing name (any case) returns the existing centre instead of a duplicate", async () => {
    const w = await world();
    const existing = await makeCentre({ name: "Sunrise Therapy", city: "Pune" });
    const res = await api().post("/api/parent-centres").set(bearer(w.a.token)).send({ name: "SUNRISE therapy", city: "Mumbai" });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, existing.id);
    assert.equal(res.body.name, "Sunrise Therapy");
    assert.equal(res.body.city, "Pune", "the existing centre is not modified");
    assert.equal(await prisma.centre.count(), 1);
  });

  for (const [name, body] of [
    ["missing name", {}],
    ["empty name", { name: "" }],
    ["name over 200 chars", { name: "x".repeat(201) }],
    ["city over 100 chars", { name: "Clinic", city: "x".repeat(101) }],
    ["non-string name", { name: 42 }]
  ] as const) {
    test(`POST 400 for ${name}; nothing written`, async () => {
      const w = await world();
      const res = await api().post("/api/parent-centres").set(bearer(w.a.token)).send(body);
      assert.equal(res.status, 400);
      assert.equal(await prisma.centre.count(), 0);
    });
  }

  test("401 without a parent token on GET and POST (nothing written)", async () => {
    const w = await world();
    await expectParentAuthRequired("get", "/api/parent-centres", w.staffToken);
    await expectParentAuthRequired("post", "/api/parent-centres", w.staffToken, { name: "Clinic" });
    assert.equal(await prisma.centre.count(), 0);
  });
});
