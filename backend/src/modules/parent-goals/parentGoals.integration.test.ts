import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { makeCentre, makeGoal, makeKid, makeParent, makeTaxonomy, makeTenant, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";

// /api/parent-kids/:kidId/goals, /goals/:goalId/evidence and /goals/extract-evidence.

async function world() {
  const tenant = await makeTenant();
  const taxonomy = await makeTaxonomy();
  await prisma.canonicalSkill.update({ where: { id: taxonomy.skill.id }, data: { measurementType: "FREQUENCY" } });
  const a = await makeParent({ name: "Parent A" });
  const b = await makeParent({ name: "Parent B" });
  const kidA = await makeKid(tenant.id, a.parent.id, { firstName: "Alex" });
  const kidA2 = await makeKid(tenant.id, a.parent.id, { firstName: "Ari" });
  const kidB = await makeKid(tenant.id, b.parent.id, { firstName: "Blake" });
  const goalA = await makeGoal(kidA, taxonomy, { title: "Alex goal" });
  const goalA2 = await makeGoal(kidA2, taxonomy, { title: "Ari goal" });
  const goalB = await makeGoal(kidB, taxonomy, { title: "Blake goal" });
  const { token: staffToken } = await makeUser("TENANT_ADMIN", tenant.id);
  return { tenant, taxonomy, a, b, kidA, kidA2, kidB, goalA, goalA2, goalB, staffToken };
}

const EVIDENCE = { logDate: "2026-11-01", outcome: "CORRECT", supportLevel: "INDEPENDENT" } as const;
const evidencePath = (kidId: string, goalId: string) => `/api/parent-kids/${kidId}/goals/${goalId}/evidence`;

describe("parent goals", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  describe("GET /:kidId/goals", () => {
    test("returns this kid's goals (newest first) with skill, discipline, items and evidence (newest log first)", async () => {
      const tenant = await makeTenant();
      const taxonomy = await makeTaxonomy();
      const centre = await makeCentre({ name: "Sunrise Therapy" });
      const { parent, token } = await makeParent();
      const kid = await makeKid(tenant.id, parent.id);
      const sibling = await makeKid(tenant.id, parent.id);
      await makeGoal(kid, taxonomy, { title: "Older goal", evidence: [{ daysAgo: 5 }, { daysAgo: 1, outcome: "PARTIAL" }] });
      await new Promise((r) => setTimeout(r, 5));
      await makeGoal(kid, taxonomy, { title: "Newer goal" });
      await makeGoal(sibling, taxonomy, { title: "Sibling goal" });
      await prisma.goalItemEvidence.updateMany({ where: { outcome: "PARTIAL" }, data: { centreId: centre.id } });

      const res = await api().get(`/api/parent-kids/${kid.id}/goals`).set(bearer(token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.map((g: { title: string }) => g.title), ["Newer goal", "Older goal"]);
      const older = res.body[1];
      assert.equal(older.kidId, kid.id);
      assert.equal(older.canonicalSkill.id, taxonomy.skill.id);
      assert.equal(older.canonicalSkill.name, "Labels familiar objects");
      assert.equal(older.canonicalSkill.domain.name, "Expressive Language");
      assert.deepEqual(older.discipline, { id: taxonomy.discipline.id, name: "Speech-Language Pathology" });
      assert.equal(older.centre, null);
      assert.equal(older.items.length, 3);
      const withEvidence = older.items.find((i: { evidence: unknown[] }) => i.evidence.length > 0);
      assert.ok(withEvidence.canonicalSkillItem.displayName);
      assert.deepEqual(withEvidence.evidence.map((e: { outcome: string }) => e.outcome), ["PARTIAL", "CORRECT"]);
      assert.deepEqual(withEvidence.evidence[0].centre, { id: centre.id, name: "Sunrise Therapy" });
      assert.equal(withEvidence.evidence[1].centre, null);
      assert.equal(older.kid, undefined, "the kid relation isn't included");
    });

    test("a kid with no goals -> []", async () => {
      const tenant = await makeTenant();
      const { parent, token } = await makeParent();
      const kid = await makeKid(tenant.id, parent.id);
      const res = await api().get(`/api/parent-kids/${kid.id}/goals`).set(bearer(token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    test("400 non-uuid kid; 404 other family's / unknown kid; 401 without a parent token", async () => {
      const w = await world();
      assert.equal((await api().get(`/api/parent-kids/abc/goals`).set(bearer(w.a.token))).status, 400);
      assert.equal((await api().get(`/api/parent-kids/${w.kidB.id}/goals`).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().get(`/api/parent-kids/${randomUUID()}/goals`).set(bearer(w.a.token))).status, 404);
      await expectParentAuthRequired("get", `/api/parent-kids/${w.kidA.id}/goals`, w.staffToken);
    });
  });

  describe("POST /:kidId/goals/:goalId/evidence", () => {
    test("logs evidence on the given goal item; measurementType comes from the skill, modality defaults to UNKNOWN", async () => {
      const w = await world();
      const item = w.goalA.goalItems[1];
      const res = await api()
        .post(evidencePath(w.kidA.id, w.goalA.goal.id))
        .set(bearer(w.a.token))
        .send({ ...EVIDENCE, goalItemId: item.id, measurementValue: 3, measurementUnit: "times" });
      assert.equal(res.status, 201);
      assert.equal(res.body.goalItemId, item.id);
      assert.equal(res.body.outcome, "CORRECT");
      assert.equal(res.body.supportLevel, "INDEPENDENT");
      assert.equal(res.body.modality, "UNKNOWN");
      assert.equal(res.body.measurementType, "FREQUENCY");
      assert.equal(res.body.measurementValue, 3);
      assert.equal(res.body.measurementUnit, "times");
      assert.equal(res.body.measurementBoolean, null);
      assert.equal(res.body.centre, null);
      assert.equal(res.body.goalItem.id, item.id);
      assert.ok(res.body.goalItem.canonicalSkillItem.displayName);
      assert.equal(new Date(res.body.logDate).toISOString().slice(0, 10), "2026-11-01");
      const rows = await prisma.goalItemEvidence.findMany();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].goalItemId, item.id);
    });

    test("tags a centre and an explicit modality", async () => {
      const w = await world();
      const centre = await makeCentre({ name: "Sunrise Therapy" });
      const res = await api()
        .post(evidencePath(w.kidA.id, w.goalA.goal.id))
        .set(bearer(w.a.token))
        .send({ ...EVIDENCE, goalItemId: w.goalA.goalItems[0].id, centreId: centre.id, modality: "AAC" });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body.centre, { id: centre.id, name: "Sunrise Therapy" });
      assert.equal(res.body.modality, "AAC");
    });

    test("newItemCustomText creates a custom item once, then reuses it (trimmed, case-insensitive)", async () => {
      const w = await world();
      const first = await api()
        .post(evidencePath(w.kidA.id, w.goalA.goal.id))
        .set(bearer(w.a.token))
        .send({ ...EVIDENCE, newItemCustomText: "Rolling ball" });
      assert.equal(first.status, 201);
      assert.equal(first.body.goalItem.customText, "Rolling ball");
      assert.equal(first.body.goalItem.canonicalSkillItem, null);
      const second = await api()
        .post(evidencePath(w.kidA.id, w.goalA.goal.id))
        .set(bearer(w.a.token))
        .send({ ...EVIDENCE, newItemCustomText: "  rolling BALL " });
      assert.equal(second.status, 201);
      assert.equal(second.body.goalItemId, first.body.goalItemId);
      assert.equal(await prisma.goalItem.count({ where: { goalId: w.goalA.goal.id } }), 4);
      assert.equal(await prisma.goalItemEvidence.count({ where: { goalItemId: first.body.goalItemId } }), 2);
    });

    test("no goalItemId and no custom text -> a single generic item on that goal, reused", async () => {
      const w = await world();
      const first = await api().post(evidencePath(w.kidA.id, w.goalA.goal.id)).set(bearer(w.a.token)).send(EVIDENCE);
      const second = await api().post(evidencePath(w.kidA.id, w.goalA.goal.id)).set(bearer(w.a.token)).send(EVIDENCE);
      assert.equal(first.status, 201);
      assert.equal(second.body.goalItemId, first.body.goalItemId);
      const item = await prisma.goalItem.findUniqueOrThrow({ where: { id: first.body.goalItemId } });
      assert.equal(item.goalId, w.goalA.goal.id);
      assert.equal(item.customText, null);
      assert.equal(item.canonicalSkillItemId, null);
    });

    test("a goalId from another family's kid under the parent's own kidId -> 404; nothing written", async () => {
      const w = await world();
      const res = await api()
        .post(evidencePath(w.kidA.id, w.goalB.goal.id))
        .set(bearer(w.a.token))
        .send({ ...EVIDENCE, goalItemId: w.goalB.goalItems[0].id });
      assert.equal(res.status, 404);
      assert.ok(!JSON.stringify(res.body).includes("Blake"));
      assert.equal(await prisma.goalItemEvidence.count(), 0);
    });

    test("a goalId from the same parent's other kid -> 404 (goal must belong to the URL's kid); nothing written", async () => {
      const w = await world();
      const res = await api().post(evidencePath(w.kidA.id, w.goalA2.goal.id)).set(bearer(w.a.token)).send(EVIDENCE);
      assert.equal(res.status, 404);
      assert.equal(await prisma.goalItemEvidence.count(), 0);
      assert.equal(await prisma.goalItem.count({ where: { goalId: w.goalA2.goal.id } }), 3, "no generic item created either");
    });

    test("a goalItemId that belongs to a different goal -> 404; nothing written", async () => {
      const w = await world();
      const otherGoalOfSameKid = await makeGoal(w.kidA, w.taxonomy, { title: "Second Alex goal" });
      for (const goalItemId of [otherGoalOfSameKid.goalItems[0].id, w.goalB.goalItems[0].id, randomUUID()]) {
        const res = await api()
          .post(evidencePath(w.kidA.id, w.goalA.goal.id))
          .set(bearer(w.a.token))
          .send({ ...EVIDENCE, goalItemId });
        assert.equal(res.status, 404);
        assert.match(res.body.error.message, /Goal item not found/);
      }
      assert.equal(await prisma.goalItemEvidence.count(), 0);
    });

    test("404 for an unknown goal and for another family's kid in the URL; nothing written", async () => {
      const w = await world();
      assert.equal((await api().post(evidencePath(w.kidA.id, randomUUID())).set(bearer(w.a.token)).send(EVIDENCE)).status, 404);
      assert.equal((await api().post(evidencePath(w.kidB.id, w.goalB.goal.id)).set(bearer(w.a.token)).send(EVIDENCE)).status, 404);
      assert.equal(await prisma.goalItemEvidence.count(), 0);
    });

    const badBodies: [string, object][] = [
      ["missing logDate", { outcome: "CORRECT", supportLevel: "INDEPENDENT" }],
      ["empty logDate", { ...EVIDENCE, logDate: "" }],
      ["unknown outcome", { ...EVIDENCE, outcome: "GREAT" }],
      ["unknown supportLevel", { ...EVIDENCE, supportLevel: "SOME" }],
      ["unknown modality", { ...EVIDENCE, modality: "TELEPATHY" }],
      ["non-uuid goalItemId", { ...EVIDENCE, goalItemId: "item-1" }],
      ["non-uuid centreId", { ...EVIDENCE, centreId: "centre-1" }],
      ["custom text too long", { ...EVIDENCE, newItemCustomText: "x".repeat(301) }],
      ["empty custom text", { ...EVIDENCE, newItemCustomText: "" }],
      ["string measurementValue", { ...EVIDENCE, measurementValue: "3" }]
    ];
    for (const [name, body] of badBodies) {
      test(`400 for ${name}; nothing written`, async () => {
        const w = await world();
        const res = await api().post(evidencePath(w.kidA.id, w.goalA.goal.id)).set(bearer(w.a.token)).send(body);
        assert.equal(res.status, 400);
        assert.equal(await prisma.goalItemEvidence.count(), 0);
      });
    }

    test("400 for non-uuid goalId / kidId", async () => {
      const w = await world();
      assert.equal((await api().post(evidencePath(w.kidA.id, "goal-1")).set(bearer(w.a.token)).send(EVIDENCE)).status, 400);
      assert.equal((await api().post(evidencePath("kid-1", w.goalA.goal.id)).set(bearer(w.a.token)).send(EVIDENCE)).status, 400);
    });

    test("an unparseable logDate is rejected with 400, not a 500", { todo: "BUG: logDate is only z.string().min(1); new Date('not-a-date') reaches Prisma and 500s" }, async () => {
      const w = await world();
      const res = await api()
        .post(evidencePath(w.kidA.id, w.goalA.goal.id))
        .set(bearer(w.a.token))
        .send({ ...EVIDENCE, logDate: "not-a-date" });
      assert.equal(res.status, 400, `got ${res.status} ${JSON.stringify(res.body)}`);
    });

    test("a well-formed but unknown centreId is rejected with 4xx, not a 500", { todo: "BUG: centreId isn't checked before insert; the FK violation surfaces as a 500" }, async () => {
      const w = await world();
      const res = await api()
        .post(evidencePath(w.kidA.id, w.goalA.goal.id))
        .set(bearer(w.a.token))
        .send({ ...EVIDENCE, centreId: randomUUID() });
      assert.ok(res.status === 400 || res.status === 404, `got ${res.status} ${JSON.stringify(res.body)}`);
    });

    test("401 without a parent token; nothing written", async () => {
      const w = await world();
      await expectParentAuthRequired("post", evidencePath(w.kidA.id, w.goalA.goal.id), w.staffToken, EVIDENCE);
      assert.equal(await prisma.goalItemEvidence.count(), 0);
    });
  });

  describe("POST /:kidId/goals/extract-evidence (AI)", () => {
    const path = (kidId: string) => `/api/parent-kids/${kidId}/goals/extract-evidence`;
    const candidate = (goalId: string) => ({
      goalId,
      itemHint: "Ball",
      outcome: "CORRECT",
      supportLevel: "VERBAL_PROMPT",
      modality: "VERBAL",
      measurementValue: 2,
      measurementUnit: "times",
      measurementBoolean: null,
      measurementText: null,
      confidence: 0.9,
      excerpt: "said ball twice"
    });

    test("returns AI candidates enriched with goal/skill/domain names; never writes evidence", async () => {
      const w = await world();
      setTestAiResponse("extract-evidence-from-note", { hasEvidence: true, evidence: [candidate(w.goalA.goal.id)] });
      const res = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send({ freeText: "Alex said ball twice with a reminder." });
      assert.equal(res.status, 200);
      assert.equal(res.body.candidates.length, 1);
      const c = res.body.candidates[0];
      assert.equal(c.goalId, w.goalA.goal.id);
      assert.equal(c.goalTitle, "Alex goal");
      assert.equal(c.skillName, "Labels familiar objects");
      assert.equal(c.domainName, "Expressive Language");
      assert.equal(c.measurementType, "FREQUENCY");
      assert.equal(c.itemHint, "Ball");
      assert.equal(c.supportLevel, "VERBAL_PROMPT");
      assert.equal(await prisma.goalItemEvidence.count(), 0);
    });

    test("an image note goes through the same path", async () => {
      const w = await world();
      setTestAiResponse("extract-evidence-from-note", { hasEvidence: false, evidence: [] });
      const res = await api()
        .post(path(w.kidA.id))
        .set(bearer(w.a.token))
        .send({ media: { kind: "image", mimeType: "image/png", base64: "iVBORw0KGgo=" } });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { candidates: [] });
    });

    test("an AI answer pointing at another family's goal is discarded, not returned", async () => {
      const w = await world();
      setTestAiResponse("extract-evidence-from-note", { hasEvidence: true, evidence: [candidate(w.goalB.goal.id)] });
      const res = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send({ freeText: "note" });
      assert.equal(res.status, 200);
      assert.ok(res.body.error, JSON.stringify(res.body));
      assert.ok(!JSON.stringify(res.body).includes(w.goalB.goal.id));
      assert.ok(!JSON.stringify(res.body).includes("Blake"));
    });

    test("AI failure (unscripted / malformed answer) -> 200 with a friendly error", async () => {
      const w = await world();
      const res = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send({ freeText: "note" });
      assert.equal(res.status, 200);
      assert.match(res.body.error, /Couldn't review this note/);
      setTestAiResponse("extract-evidence-from-note", { hasEvidence: false, evidence: [candidate(w.goalA.goal.id)] });
      const inconsistent = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send({ freeText: "note" });
      assert.match(inconsistent.body.error, /Couldn't review this note/);
    });

    test("a kid without ACTIVE goals -> 200 with a 'no active goals' error (no AI call needed)", async () => {
      const w = await world();
      await prisma.goal.update({ where: { id: w.goalA.goal.id }, data: { status: "ACHIEVED" } });
      setTestAiResponse("extract-evidence-from-note", { hasEvidence: true, evidence: [candidate(w.goalA.goal.id)] });
      const res = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send({ freeText: "note" });
      assert.equal(res.status, 200);
      assert.match(res.body.error, /no active goals/);
    });

    const badBodies: [string, object][] = [
      ["neither freeText nor media", {}],
      ["both freeText and media", { freeText: "x", media: { kind: "image", mimeType: "image/png", base64: "x" } }],
      ["empty freeText", { freeText: "" }],
      ["freeText over 8000 chars", { freeText: "x".repeat(8001) }],
      ["unsupported media kind", { media: { kind: "video", mimeType: "video/mp4", base64: "x" } }],
      ["empty media base64", { media: { kind: "image", mimeType: "image/png", base64: "" } }]
    ];
    for (const [name, body] of badBodies) {
      test(`400 for ${name}`, async () => {
        const w = await world();
        const res = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send(body);
        assert.equal(res.status, 400);
      });
    }

    test("400 non-uuid kid; 404 other family's kid; 401 without a parent token", async () => {
      const w = await world();
      setTestAiResponse("extract-evidence-from-note", { hasEvidence: true, evidence: [candidate(w.goalB.goal.id)] });
      assert.equal((await api().post(path("abc")).set(bearer(w.a.token)).send({ freeText: "x" })).status, 400);
      const res = await api().post(path(w.kidB.id)).set(bearer(w.a.token)).send({ freeText: "x" });
      assert.equal(res.status, 404);
      assert.ok(!JSON.stringify(res.body).includes("Blake"));
      await expectParentAuthRequired("post", path(w.kidA.id), w.staffToken, { freeText: "x" });
    });
  });
});
