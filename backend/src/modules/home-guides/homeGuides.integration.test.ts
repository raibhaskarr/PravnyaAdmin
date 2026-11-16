import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { makeGoal, makeKid, makeParent, makeTaxonomy, makeTenant, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";

// Activity walkthroughs: one AI-drafted guide per skill (saved, reused, reviewable), wrapped with
// the child's own item, last level of help at the centre, and the therapist's IEP notes.

const GUIDE = {
  summary: "Practise naming things your child sees every day.",
  minutes: 5,
  materials: ["A small basket of familiar things"],
  steps: [
    { title: "Pick a moment", detail: "During play, sit face to face." },
    { title: "Hold it up", detail: "Hold up the item you're practising and wait." },
    { title: "Wait", detail: "Count to five in your head." }
  ],
  ifItsHard: ["Wait longer.", "Say the first sound.", "Say the word for them to copy."],
  success: "Your child names it, with or without help.",
  keepItFun: ["Praise the try."],
  stopIf: "Stop if your child is upset or tired."
};

async function world() {
  const tenant = await makeTenant({ name: "Sunrise Centre" });
  const fam = await makeParent({ name: "Maya" });
  const kid = await makeKid(tenant.id, fam.parent.id, { firstName: "Aarav" });
  const taxonomy = await makeTaxonomy();
  const { goal, goalItems } = await makeGoal(kid, taxonomy, {
    title: "Name familiar objects",
    evidence: [
      { daysAgo: 6, supportLevel: "PHYSICAL_PROMPT", centreName: "Sunrise Centre" },
      { daysAgo: 2, supportLevel: "VERBAL_PROMPT", centreName: "Sunrise Centre" }
    ]
  });
  const other = await makeParent({ name: "Other" });
  return { tenant, fam, kid, taxonomy, goal, goalItems, other };
}

const walk = (w: Awaited<ReturnType<typeof world>>, token = w.fam.token) => api().get(`/api/parent-kids/${w.kid.id}/goals/${w.goal.id}/walkthrough`).set(bearer(token));

describe("activity walkthroughs", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("first open drafts the skill's guide with AI and saves it; the walkthrough adds the child's item and last help", async () => {
    const w = await world();
    setTestAiResponse("skill-home-guide", GUIDE);
    const res = await walk(w);
    assert.equal(res.status, 200);
    assert.equal(res.body.guideKind, "drafted");
    assert.deepEqual(res.body.guide, GUIDE);
    assert.deepEqual(res.body.item, { goalItemId: w.goalItems[0].id, label: "Ball" }, "the item practised at the centre");
    assert.equal(res.body.lastAtCentre.supportLevel, "VERBAL_PROMPT", "the most recent centre entry");
    assert.equal(res.body.lastAtCentre.centreName, "Sunrise Centre");
    assert.equal(res.body.fromPlan, null);
    assert.equal(await prisma.skillHomeGuide.count(), 1);

    // A second open (any child, same skill) reuses the saved guide, no AI call needed.
    const again = await walk(w);
    assert.deepEqual(again.body.guide, GUIDE);
    assert.equal(await prisma.skillHomeGuide.count(), 1);
  });

  test("without AI: a general walkthrough, not saved, so the skill gets a real guide later", async () => {
    const w = await world();
    const res = await walk(w);
    assert.equal(res.status, 200);
    assert.equal(res.body.guideKind, "general");
    assert.match(res.body.guide.summary, /"Name familiar objects"/, "names the child's goal");
    assert.ok(res.body.guide.steps.length >= 3);
    assert.equal(await prisma.skillHomeGuide.count(), 0);
  });

  test("includes the therapist's home practice for this goal from a shared IEP", async () => {
    const w = await world();
    await prisma.iepPlan.create({
      data: {
        tenantId: w.tenant.id,
        kidId: w.kid.id,
        authorName: "Speech Therapist",
        centreName: "Sunrise Centre",
        title: "Individualised Education Plan",
        baselineFrom: new Date(),
        baselineTo: new Date(),
        planStart: new Date(),
        reviewDate: new Date(Date.now() + 90 * 86_400_000),
        content: { presentLevels: "x", strengths: [], notes: "", goals: [{ goalId: w.goal.id, title: "Name familiar objects", area: "", baseline: "b", target: "Names 5 objects with one prompt", strategies: [], homePractice: ["Name toys at bath time"] }] },
        stats: {},
        status: "FINAL",
        finalisedAt: new Date(),
        sharedAt: new Date()
      }
    });
    const res = await walk(w);
    assert.deepEqual(res.body.fromPlan, { authorName: "Speech Therapist", homePractice: ["Name toys at bath time"], target: "Names 5 objects with one prompt" });
  });

  test("a parent can only open their own child's goals", async () => {
    const w = await world();
    assert.equal((await walk(w, w.other.token)).status, 404);
    const otherKid = await makeKid(w.tenant.id, w.fam.parent.id, { firstName: "Isha" });
    assert.equal((await api().get(`/api/parent-kids/${otherKid.id}/goals/${w.goal.id}/walkthrough`).set(bearer(w.fam.token))).status, 404, "goal of a different child");
  });

  test("superadmin reviews guides: list skills in use, edit and mark reviewed; others can't", async () => {
    const w = await world();
    const sa = await makeUser("SUPERADMIN", null);
    const admin = await makeUser("TENANT_ADMIN", w.tenant.id);
    assert.equal((await api().get("/api/home-guides").set(bearer(admin.token))).status, 403);

    const list = await api().get("/api/home-guides").set(bearer(sa.token));
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map((s: { skillName: string; activeGoals: number; guide: unknown }) => [s.skillName, s.activeGoals, s.guide]), [["Labels familiar objects", 1, null]]);

    assert.equal((await api().put(`/api/home-guides/${w.taxonomy.skill.id}`).set(bearer(sa.token)).send({ content: { ...GUIDE, steps: [] }, reviewed: true })).status, 400, "at least two steps");
    const saved = await api().put(`/api/home-guides/${w.taxonomy.skill.id}`).set(bearer(sa.token)).send({ content: GUIDE, reviewed: true });
    assert.equal(saved.status, 200);
    assert.ok(saved.body.reviewedAt);
    assert.equal(saved.body.reviewedById, sa.user.id);

    const res = await walk(w);
    assert.equal(res.body.guideKind, "reviewed");
    assert.equal(res.body.guide.summary, GUIDE.summary);

    const unreviewed = await api().put(`/api/home-guides/${w.taxonomy.skill.id}`).set(bearer(sa.token)).send({ content: GUIDE, reviewed: false });
    assert.equal(unreviewed.body.reviewedAt, null);
    const one = await api().get(`/api/home-guides/${w.taxonomy.skill.id}`).set(bearer(sa.token));
    assert.equal(one.body.guide.content.summary, GUIDE.summary);
    assert.ok(one.body.general.steps.length >= 3);
  });
});
