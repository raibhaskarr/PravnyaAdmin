import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { linkTherapist, makeGoal, makeKid, makeParent, makeRetailTenant, makeTaxonomy, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";

// The most important property of the parent API: a parent can only ever reach their own child.
// Every per-kid parent route is tried with another family's kid id, and must answer 404 (not 403 --
// the route shouldn't even confirm that kid exists) without leaking any of that kid's data.

type Ctx = { tokenA: string; tokenB: string; kidA: string; kidB: string; staffToken: string };
const ctx = {} as Ctx;

describe("parent routes: one family can never reach another family's child", () => {
  before(async () => {
    await resetDb();
    const tenant = await makeTenant();
    await makeRetailTenant();
    const taxonomy = await makeTaxonomy();
    const a = await makeParent({ name: "Parent A" });
    const b = await makeParent({ name: "Parent B" });
    const kidA = await makeKid(tenant.id, a.parent.id, { firstName: "Alex" });
    const kidB = await makeKid(tenant.id, b.parent.id, { firstName: "Blake" });
    await makeGoal(kidA, taxonomy, { title: "Alex goal", evidence: [{ daysAgo: 1 }] });
    await makeGoal(kidB, taxonomy, { title: "Blake goal", evidence: [{ daysAgo: 1 }] });
    const { therapist } = await makeTherapist(tenant.id);
    await linkTherapist(kidB.id, therapist.id);
    const { token: staffToken } = await makeUser("TENANT_ADMIN", tenant.id);
    Object.assign(ctx, { tokenA: a.token, tokenB: b.token, kidA: kidA.id, kidB: kidB.id, staffToken });
  });
  after(disconnectDb);

  test("a parent sees their own child's goals", async () => {
    const res = await api().get(`/api/parent-kids/${ctx.kidA}/goals`).set(bearer(ctx.tokenA));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((g: { title: string }) => g.title), ["Alex goal"]);
  });

  test("/me lists only the parent's own children", async () => {
    const res = await api().get("/api/parent-auth/me").set(bearer(ctx.tokenA));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.kids.map((k: { firstName: string }) => k.firstName), ["Alex"]);
  });

  const otherFamilyRoutes: { method: "get" | "post" | "patch" | "delete"; path: (kid: string) => string; body?: object }[] = [
    { method: "patch", path: (k) => `/api/parent-kids/${k}`, body: { gender: "Hacked" } },
    { method: "get", path: (k) => `/api/parent-kids/${k}/goals` },
    { method: "get", path: (k) => `/api/parent-kids/${k}/schedule` },
    { method: "post", path: (k) => `/api/parent-kids/${k}/schedule`, body: { label: "Speech therapy", dayOfWeek: "Mon", startTime: "16:00" } },
    { method: "get", path: (k) => `/api/parent-kids/${k}/companion/messages` },
    { method: "post", path: (k) => `/api/parent-kids/${k}/companion/messages`, body: { text: "hello" } },
    { method: "get", path: (k) => `/api/parent-kids/${k}/therapists` },
    { method: "get", path: (k) => `/api/parent-kids/${k}/therapist-invitations` },
    { method: "post", path: (k) => `/api/parent-kids/${k}/therapist-invitations`, body: { email: "someone@test.local" } }
  ];

  for (const route of otherFamilyRoutes) {
    test(`${route.method.toUpperCase()} ${route.path(":otherKid")} -> 404 for another family's child`, async () => {
      let req = api()[route.method](route.path(ctx.kidB)).set(bearer(ctx.tokenA));
      if (route.body) req = req.send(route.body);
      const res = await req;
      assert.equal(res.status, 404, `expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(!JSON.stringify(res.body).includes("Blake"), "response must not leak the other child's data");
    });

    test(`${route.method.toUpperCase()} ${route.path(":kid")} -> 401 without a parent token`, async () => {
      const anon = await api()[route.method](route.path(ctx.kidA));
      assert.equal(anon.status, 401);
      const staff = await api()[route.method](route.path(ctx.kidA)).set(bearer(ctx.staffToken));
      assert.equal(staff.status, 401, "a staff token must not work on parent routes");
    });
  }

  // Positive control: the identical requests succeed on the parent's own child, which proves each
  // body above is valid -- so every 404 above really came from the ownership check, not validation.
  for (const route of otherFamilyRoutes) {
    test(`${route.method.toUpperCase()} ${route.path(":ownKid")} -> succeeds for the parent's own child`, async () => {
      let req = api()[route.method](route.path(ctx.kidA)).set(bearer(ctx.tokenA));
      if (route.body) req = req.send(route.body);
      const res = await req;
      assert.ok(res.status >= 200 && res.status < 300, `expected 2xx, got ${res.status}: ${JSON.stringify(res.body)}`);
    });
  }

  test("the other family's child was not modified", async () => {
    const res = await api().get("/api/parent-auth/me").set(bearer(ctx.tokenB));
    assert.deepEqual(res.body.kids.map((k: { firstName: string }) => k.firstName), ["Blake"]);
    assert.notEqual(res.body.kids[0].gender, "Hacked");
  });
});
