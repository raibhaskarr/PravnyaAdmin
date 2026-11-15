import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { makeGoal, makeKid, makeParent, makeTaxonomy, makeTenant, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";

// /api/parent-kids/:kidId/companion/messages -- the parent-facing AI companion thread.

async function world() {
  const tenant = await makeTenant();
  const a = await makeParent({ name: "Parent A" });
  const b = await makeParent({ name: "Parent B" });
  const kidA = await makeKid(tenant.id, a.parent.id, { firstName: "Alex" });
  const kidA2 = await makeKid(tenant.id, a.parent.id, { firstName: "Ari" });
  const kidB = await makeKid(tenant.id, b.parent.id, { firstName: "Blake" });
  const { token: staffToken } = await makeUser("TENANT_ADMIN", tenant.id);
  return { tenant, a, b, kidA, kidA2, kidB, staffToken };
}

const path = (kidId: string) => `/api/parent-kids/${kidId}/companion/messages`;
const FALLBACK = "I couldn't think that through just now -- try again in a moment.";

describe("parent companion", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  describe("GET /:kidId/companion/messages", () => {
    test("returns this kid's thread oldest first, nothing from other kids", async () => {
      const w = await world();
      const m1 = await prisma.companionMessage.create({ data: { kidId: w.kidA.id, role: "PARENT", content: "How is Alex doing?" } });
      await new Promise((r) => setTimeout(r, 5));
      const m2 = await prisma.companionMessage.create({ data: { kidId: w.kidA.id, role: "ASSISTANT", content: "Doing well." } });
      await prisma.companionMessage.create({ data: { kidId: w.kidA2.id, role: "PARENT", content: "Sibling message" } });
      await prisma.companionMessage.create({ data: { kidId: w.kidB.id, role: "PARENT", content: "Blake message" } });
      const res = await api().get(path(w.kidA.id)).set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.map((m: { id: string }) => m.id), [m1.id, m2.id]);
      assert.deepEqual(Object.keys(res.body[0]).sort(), ["content", "createdAt", "id", "kidId", "role"]);
      assert.equal(res.body[1].role, "ASSISTANT");
    });

    test("empty thread -> []", async () => {
      const w = await world();
      const res = await api().get(path(w.kidA.id)).set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    test("400 non-uuid kid; 404 other family's / unknown kid; 401 without a parent token", async () => {
      const w = await world();
      assert.equal((await api().get(path("abc")).set(bearer(w.a.token))).status, 400);
      assert.equal((await api().get(path(w.kidB.id)).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().get(path(randomUUID())).set(bearer(w.a.token))).status, 404);
      await expectParentAuthRequired("get", path(w.kidA.id), w.staffToken);
    });
  });

  describe("POST /:kidId/companion/messages", () => {
    test("a question: returns the AI reply and persists both the parent's message and the reply", async () => {
      const w = await world();
      const taxonomy = await makeTaxonomy();
      await makeGoal(w.kidA, taxonomy, { title: "Label familiar objects" });
      setTestAiResponse("companion-message", { intent: "question", reply: "Try naming objects during bath time." });
      const res = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send({ text: "Any ideas for practising at home?" });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { intent: "question", reply: "Try naming objects during bath time." });
      const thread = await api().get(path(w.kidA.id)).set(bearer(w.a.token));
      assert.deepEqual(
        thread.body.map((m: { role: string; content: string }) => [m.role, m.content]),
        [
          ["PARENT", "Any ideas for practising at home?"],
          ["ASSISTANT", "Try naming objects during bath time."]
        ]
      );
    });

    test("a log: returns {intent: 'log'} and persists only the parent's message", async () => {
      const w = await world();
      setTestAiResponse("companion-message", { intent: "log" });
      const res = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send({ text: "We practised animal sounds today, she got three right." });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { intent: "log" });
      const rows = await prisma.companionMessage.findMany({ where: { kidId: w.kidA.id } });
      assert.deepEqual(rows.map((m) => m.role), ["PARENT"]);
    });

    for (const [name, script] of [
      ["unscripted (AI unavailable)", undefined],
      ["a question with no reply", { intent: "question" }],
      ["an empty reply", { intent: "question", reply: "" }],
      ["a reply over 1200 chars", { intent: "question", reply: "x".repeat(1201) }],
      ["an unknown intent", { intent: "chat", reply: "hi" }],
      ["non-JSON text", "Sure! Here are some ideas..."]
    ] as const) {
      test(`AI failure (${name}) -> fallback reply; fallback is not persisted, the parent's message is`, async () => {
        const w = await world();
        if (script !== undefined) setTestAiResponse("companion-message", script);
        const res = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send({ text: "How is Alex doing?" });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { intent: "question", reply: FALLBACK });
        const rows = await prisma.companionMessage.findMany({ where: { kidId: w.kidA.id } });
        assert.deepEqual(rows.map((m) => [m.role, m.content]), [["PARENT", "How is Alex doing?"]]);
      });
    }

    for (const [name, body] of [
      ["missing text", {}],
      ["empty text", { text: "" }],
      ["text over 2000 chars", { text: "x".repeat(2001) }],
      ["non-string text", { text: 42 }]
    ] as const) {
      test(`400 for ${name}; nothing persisted`, async () => {
        const w = await world();
        setTestAiResponse("companion-message", { intent: "question", reply: "hi" });
        const res = await api().post(path(w.kidA.id)).set(bearer(w.a.token)).send(body);
        assert.equal(res.status, 400);
        assert.equal(await prisma.companionMessage.count(), 0);
      });
    }

    test("400 non-uuid kid; 404 other family's kid; 401 without a parent token -- nothing persisted", async () => {
      const w = await world();
      setTestAiResponse("companion-message", { intent: "question", reply: "hi" });
      assert.equal((await api().post(path("abc")).set(bearer(w.a.token)).send({ text: "hi" })).status, 400);
      assert.equal((await api().post(path(w.kidB.id)).set(bearer(w.a.token)).send({ text: "hi" })).status, 404);
      await expectParentAuthRequired("post", path(w.kidA.id), w.staffToken, { text: "hi" });
      assert.equal(await prisma.companionMessage.count(), 0);
    });
  });
});
