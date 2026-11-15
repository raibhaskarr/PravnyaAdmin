import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { enableDisciplines, makeGoal, makeKid, makeParent, makeRetailTenant, makeTaxonomy, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";

// POST /api/parent-kids/:kidId/iep/extract (AI, never persists) and /iep/accept-goals (creates
// goals with no review step, skipping any candidate without a disciplineId).

/** A minimal one-page PDF with real embedded text, so the text-extraction path runs without fixtures. */
function makePdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1").toString("base64");
}

const IMAGE = { source: { kind: "image", base64: "iVBORw0KGgo=", mimeType: "image/jpeg" } };

async function world(opts: { enable?: boolean } = {}) {
  const retail = await makeRetailTenant();
  const taxonomy = await makeTaxonomy();
  await prisma.canonicalSkill.update({ where: { id: taxonomy.skill.id }, data: { supportedModalities: ["AAC", "VERBAL"], measurementType: "TRIALS" } });
  // Production's retail tenant has its disciplines enabled; mirror that unless a test opts out.
  if (opts.enable !== false) await enableDisciplines(retail.id, [taxonomy.discipline.id]);
  const a = await makeParent({ name: "Parent A" });
  const b = await makeParent({ name: "Parent B" });
  const kidA = await makeKid(retail.id, a.parent.id, { firstName: "Alex" });
  const kidB = await makeKid(retail.id, b.parent.id, { firstName: "Blake" });
  const { token: staffToken } = await makeUser("TENANT_ADMIN", retail.id);
  return { retail, taxonomy, a, b, kidA, kidB, staffToken };
}

const statusUpdate = (goalId: string) => ({
  goalId,
  itemHint: null,
  outcome: "PARTIAL",
  supportLevel: "VISUAL_PROMPT",
  modality: "VERBAL",
  measurementValue: null,
  measurementUnit: null,
  measurementBoolean: null,
  measurementText: null,
  confidence: 0.8,
  excerpt: "Alex is emerging on labeling"
});

const newGoal = (canonicalSkillId: string) => ({
  canonicalSkillId,
  title: "Alex will label 10 familiar objects",
  confidence: 0.85,
  sourceExcerpt: "Goal 1: label ten familiar objects"
});

const extractPath = (kidId: string) => `/api/parent-kids/${kidId}/iep/extract`;
const acceptPath = (kidId: string) => `/api/parent-kids/${kidId}/iep/accept-goals`;

describe("parent IEP", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  describe("POST /:kidId/iep/extract", () => {
    test("photo: returns new-goal candidates (with derived discipline/modality) and status updates; persists nothing", async () => {
      const w = await world();
      const { goal } = await makeGoal(w.kidA, w.taxonomy, { title: "Existing Alex goal" });
      setTestAiResponse("extract-iep-goals", { newGoals: [newGoal(w.taxonomy.skill.id)], statusUpdates: [statusUpdate(goal.id)] });
      const goalsBefore = await prisma.goal.count();

      const res = await api().post(extractPath(w.kidA.id)).set(bearer(w.a.token)).send(IMAGE);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.newGoals, [
        {
          canonicalSkillId: w.taxonomy.skill.id,
          skillName: "Labels familiar objects",
          domainName: "Expressive Language",
          measurementType: "TRIALS",
          disciplineId: w.taxonomy.discipline.id,
          modality: "AAC",
          title: "Alex will label 10 familiar objects",
          confidence: 0.85,
          sourceExcerpt: "Goal 1: label ten familiar objects"
        }
      ]);
      assert.equal(res.body.statusUpdates.length, 1);
      assert.equal(res.body.statusUpdates[0].goalId, goal.id);
      assert.equal(res.body.statusUpdates[0].goalTitle, "Existing Alex goal");
      assert.equal(res.body.statusUpdates[0].skillName, "Labels familiar objects");
      assert.equal(res.body.statusUpdates[0].measurementType, "TRIALS");
      assert.equal(await prisma.goal.count(), goalsBefore);
      assert.equal(await prisma.goalItemEvidence.count(), 0);
    });

    test("PDF with embedded text goes through the text path", async () => {
      const w = await world();
      setTestAiResponse("extract-iep-goals", { newGoals: [newGoal(w.taxonomy.skill.id)] });
      const base64 = makePdf("Goal one: Alex will label ten familiar objects independently in four of five trials.");
      const res = await api().post(extractPath(w.kidA.id)).set(bearer(w.a.token)).send({ source: { kind: "pdf", base64 } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.newGoals.length, 1);
      assert.deepEqual(res.body.statusUpdates, [], "no active goals -> no status-update call");
    });

    test("a file that isn't a readable PDF -> 200 with a friendly error, no AI needed", async () => {
      const w = await world();
      const res = await api()
        .post(extractPath(w.kidA.id))
        .set(bearer(w.a.token))
        .send({ source: { kind: "pdf", base64: Buffer.from("definitely not a pdf").toString("base64") } });
      assert.equal(res.status, 200);
      assert.match(res.body.error, /Couldn't read any text from this PDF/);
    });

    test("without enabled tenant disciplines a candidate comes back with disciplineId null", async () => {
      const w = await world({ enable: false });
      setTestAiResponse("extract-iep-goals", { newGoals: [newGoal(w.taxonomy.skill.id)] });
      const res = await api().post(extractPath(w.kidA.id)).set(bearer(w.a.token)).send(IMAGE);
      assert.equal(res.status, 200);
      assert.equal(res.body.newGoals[0].disciplineId, null);
    });

    test("an AI status update aimed at another family's goal fails that half; the other half still returns", async () => {
      const w = await world();
      await makeGoal(w.kidA, w.taxonomy);
      const { goal: foreignGoal } = await makeGoal(w.kidB, w.taxonomy, { title: "Blake goal" });
      setTestAiResponse("extract-iep-goals", { newGoals: [newGoal(w.taxonomy.skill.id)], statusUpdates: [statusUpdate(foreignGoal.id)] });
      const res = await api().post(extractPath(w.kidA.id)).set(bearer(w.a.token)).send(IMAGE);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.statusUpdates, []);
      assert.equal(res.body.newGoals.length, 1);
      assert.ok(!JSON.stringify(res.body).includes(foreignGoal.id));
    });

    test("an AI new goal with an unknown skill id fails that half; status updates still return", async () => {
      const w = await world();
      const { goal } = await makeGoal(w.kidA, w.taxonomy);
      setTestAiResponse("extract-iep-goals", { newGoals: [newGoal(randomUUID())], statusUpdates: [statusUpdate(goal.id)] });
      const res = await api().post(extractPath(w.kidA.id)).set(bearer(w.a.token)).send(IMAGE);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.newGoals, []);
      assert.equal(res.body.statusUpdates.length, 1);
    });

    test("AI failure on both halves -> 200 with a friendly error", async () => {
      const w = await world();
      await makeGoal(w.kidA, w.taxonomy);
      const res = await api().post(extractPath(w.kidA.id)).set(bearer(w.a.token)).send(IMAGE);
      assert.equal(res.status, 200);
      assert.match(res.body.error, /Couldn't read goals from this document/);
    });

    test("no canonical skills at all -> 200 with an error", async () => {
      const retail = await makeRetailTenant();
      const { parent, token } = await makeParent();
      const kid = await makeKid(retail.id, parent.id);
      const res = await api().post(extractPath(kid.id)).set(bearer(token)).send(IMAGE);
      assert.equal(res.status, 200);
      assert.match(res.body.error, /No canonical skills/);
    });

    const badBodies: [string, object][] = [
      ["missing source", {}],
      ["CSV source (staff-only)", { source: { kind: "csv", csvText: "title\nLabel objects" } }],
      ["unknown kind", { source: { kind: "docx", base64: "x" } }],
      ["image without mimeType", { source: { kind: "image", base64: "x" } }],
      ["empty base64", { source: { kind: "pdf", base64: "" } }]
    ];
    for (const [name, body] of badBodies) {
      test(`400 for ${name}`, async () => {
        const w = await world();
        const res = await api().post(extractPath(w.kidA.id)).set(bearer(w.a.token)).send(body);
        assert.equal(res.status, 400);
      });
    }

    test("400 non-uuid kid; 404 other family's kid (no leak); 401 without a parent token", async () => {
      const w = await world();
      const { goal: foreignGoal } = await makeGoal(w.kidB, w.taxonomy, { title: "Blake goal" });
      setTestAiResponse("extract-iep-goals", { newGoals: [], statusUpdates: [statusUpdate(foreignGoal.id)] });
      assert.equal((await api().post(extractPath("abc")).set(bearer(w.a.token)).send(IMAGE)).status, 400);
      const res = await api().post(extractPath(w.kidB.id)).set(bearer(w.a.token)).send(IMAGE);
      assert.equal(res.status, 404);
      assert.ok(!JSON.stringify(res.body).includes("Blake"));
      await expectParentAuthRequired("post", extractPath(w.kidA.id), w.staffToken, IMAGE);
    });
  });

  describe("POST /:kidId/iep/accept-goals", () => {
    const accepted = (w: Awaited<ReturnType<typeof world>>, overrides: Record<string, unknown> = {}) => ({
      canonicalSkillId: w.taxonomy.skill.id,
      disciplineId: w.taxonomy.discipline.id,
      modality: "AAC",
      title: "Alex will label 10 familiar objects",
      confidence: 0.85,
      sourceExcerpt: "Goal 1: label ten familiar objects",
      ...overrides
    });

    test("creates one ACTIVE goal per candidate on the kid's tenant; a null modality defaults to VERBAL", async () => {
      const w = await world();
      const res = await api()
        .post(acceptPath(w.kidA.id))
        .set(bearer(w.a.token))
        .send({ candidates: [accepted(w), accepted(w, { modality: null, title: "Second goal" })] });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body, { created: 2, skipped: 0 });
      const goals = await prisma.goal.findMany({ where: { kidId: w.kidA.id }, orderBy: { title: "asc" } });
      assert.equal(goals.length, 2);
      const first = goals.find((g) => g.title === "Alex will label 10 familiar objects")!;
      assert.equal(first.tenantId, w.retail.id);
      assert.equal(first.canonicalSkillId, w.taxonomy.skill.id);
      assert.equal(first.disciplineId, w.taxonomy.discipline.id);
      assert.equal(first.modality, "AAC");
      assert.equal(first.status, "ACTIVE");
      assert.equal(first.confidence, 0.85);
      assert.equal(first.rationale, "Goal 1: label ten familiar objects");
      assert.equal(goals.find((g) => g.title === "Second goal")!.modality, "VERBAL");
      // and they show up in the parent's goal list
      const list = await api().get(`/api/parent-kids/${w.kidA.id}/goals`).set(bearer(w.a.token));
      assert.equal(list.body.length, 2);
    });

    // FINDING: a candidate without a disciplineId (what extract returns when the tenant has no
    // enabled disciplines) is silently skipped -- the response still succeeds. The parent app
    // ignores `skipped`, so from the parent's point of view the goal just never appears.
    test("candidates without a disciplineId are skipped, not created (silent skip)", async () => {
      const w = await world({ enable: false });
      const allSkipped = await api()
        .post(acceptPath(w.kidA.id))
        .set(bearer(w.a.token))
        .send({ candidates: [accepted(w, { disciplineId: null }), accepted(w, { disciplineId: null, title: "Other" })] });
      assert.equal(allSkipped.status, 201);
      assert.deepEqual(allSkipped.body, { created: 0, skipped: 2 });
      assert.equal(await prisma.goal.count(), 0);

      const mixed = await api()
        .post(acceptPath(w.kidA.id))
        .set(bearer(w.a.token))
        .send({ candidates: [accepted(w), accepted(w, { disciplineId: null, title: "Skipped one" })] });
      assert.deepEqual(mixed.body, { created: 1, skipped: 1 });
      assert.deepEqual((await prisma.goal.findMany()).map((g) => g.title), ["Alex will label 10 familiar objects"]);
    });

    const badCandidates: [string, (w: Awaited<ReturnType<typeof world>>) => object][] = [
      ["no candidates", () => ({ candidates: [] })],
      ["missing candidates", () => ({})],
      ["more than 30 candidates", (w) => ({ candidates: Array.from({ length: 31 }, () => accepted(w)) })],
      ["non-uuid canonicalSkillId", (w) => ({ candidates: [accepted(w, { canonicalSkillId: "skill-1" })] })],
      ["non-uuid disciplineId", (w) => ({ candidates: [accepted(w, { disciplineId: "slp" })] })],
      ["modality outside the goal set", (w) => ({ candidates: [accepted(w, { modality: "UNKNOWN" })] })],
      ["empty title", (w) => ({ candidates: [accepted(w, { title: "" })] })],
      ["confidence above 1", (w) => ({ candidates: [accepted(w, { confidence: 1.5 })] })],
      ["missing sourceExcerpt", (w) => ({ candidates: [{ ...accepted(w), sourceExcerpt: undefined }] })]
    ];
    for (const [name, body] of badCandidates) {
      test(`400 for ${name}; nothing created`, async () => {
        const w = await world();
        const res = await api().post(acceptPath(w.kidA.id)).set(bearer(w.a.token)).send(body(w));
        assert.equal(res.status, 400);
        assert.equal(await prisma.goal.count(), 0);
      });
    }

    test(
      "a well-formed but unknown canonicalSkillId/disciplineId is rejected with 4xx, not a 500",
      { todo: "BUG: ids aren't checked before goal.createMany; the FK violation surfaces as a 500" },
      async () => {
        const w = await world();
        const badSkill = await api().post(acceptPath(w.kidA.id)).set(bearer(w.a.token)).send({ candidates: [accepted(w, { canonicalSkillId: randomUUID() })] });
        assert.ok(badSkill.status >= 400 && badSkill.status < 500, `unknown skill: got ${badSkill.status} ${JSON.stringify(badSkill.body)}`);
        const badDiscipline = await api().post(acceptPath(w.kidA.id)).set(bearer(w.a.token)).send({ candidates: [accepted(w, { disciplineId: randomUUID() })] });
        assert.ok(badDiscipline.status >= 400 && badDiscipline.status < 500, `unknown discipline: got ${badDiscipline.status}`);
      }
    );

    test("400 non-uuid kid; 404 other family's kid (nothing created); 401 without a parent token", async () => {
      const w = await world();
      const body = { candidates: [accepted(w)] };
      assert.equal((await api().post(acceptPath("abc")).set(bearer(w.a.token)).send(body)).status, 400);
      assert.equal((await api().post(acceptPath(w.kidB.id)).set(bearer(w.a.token)).send(body)).status, 404);
      assert.equal((await api().post(acceptPath(randomUUID())).set(bearer(w.a.token)).send(body)).status, 404);
      await expectParentAuthRequired("post", acceptPath(w.kidA.id), w.staffToken, body);
      assert.equal(await prisma.goal.count(), 0);
    });
  });
});
