import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { testOutbox } from "../therapist-invitations/invitationEmail.service";
import { linkTherapist, makeGoal, makeKid, makeParent, makeTaxonomy, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";

// IEP plans: staff draft (AI or template) from active goals + logged figures -> edit -> finalise (locked).

const DAY = 86_400_000;

async function world() {
  const tenant = await makeTenant({ name: "Sunrise Centre" });
  const fam = await makeParent({ name: "Maya" });
  const kid = await makeKid(tenant.id, fam.parent.id, { firstName: "Aarav" });
  const taxonomy = await makeTaxonomy();
  const { goal: requests } = await makeGoal(kid, taxonomy, {
    title: "Request items with two words",
    evidence: [
      { daysAgo: 5, outcome: "CORRECT", supportLevel: "INDEPENDENT", centreName: "Sunrise Centre" },
      { daysAgo: 40, outcome: "CORRECT", supportLevel: "VERBAL_PROMPT", centreName: null },
      { daysAgo: 60, outcome: "INCORRECT", supportLevel: "VERBAL_PROMPT", centreName: "Sunrise Centre" }
    ]
  });
  const { goal: greetings } = await makeGoal(kid, taxonomy, { title: "Greet familiar adults" });
  const admin = await makeUser("TENANT_ADMIN", tenant.id);
  const viewer = await makeUser("VIEWER", tenant.id);
  const linked = await makeTherapist(tenant.id);
  await linkTherapist(kid.id, linked.therapist.id);
  const unlinked = await makeTherapist(tenant.id);
  return { tenant, fam, kid, requests, greetings, admin, viewer, linked, unlinked };
}

describe("IEP plans", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("a linked therapist drafts with AI: one entry per active goal, figures from evidence, review in ~3 months", async () => {
    const w = await world();
    setTestAiResponse("iep-plan-draft", {
      presentLevels: "Aarav is starting to ask for things with two words.",
      strengths: ["Asked for a ball without help for the first time."],
      goals: [
        { goalId: w.requests.id, baseline: "Correct in 2 of 3 attempts, 1 without help.", target: "With a pause, asks with two words in 4 of 5 opportunities.", strategies: ["Wait time"], homePractice: ["Pause at snack time"] }
      ]
    });
    const res = await api().post("/api/iep-plans").set(bearer(w.linked.token)).send({ kidId: w.kid.id });
    assert.equal(res.status, 201);
    const p = res.body;
    assert.equal(p.status, "DRAFT");
    assert.equal(p.aiDrafted, true);
    assert.equal(p.centreName, "Sunrise Centre");
    assert.equal(p.authorName, w.linked.therapist.name);
    assert.equal(p.title, "Individualised Education Plan");
    const days = (new Date(p.reviewDate).getTime() - new Date(p.planStart).getTime()) / DAY;
    assert.ok(days > 89 && days < 93);
    assert.equal(p.stats.totalEntries, 3, "90-day window includes all three entries");

    assert.deepEqual(p.content.goals.map((g: { title: string }) => g.title), ["Request items with two words", "Greet familiar adults"]);
    const [req, greet] = p.content.goals;
    assert.equal(req.target, "With a pause, asks with two words in 4 of 5 opportunities.");
    assert.deepEqual(req.homePractice, ["Pause at snack time"]);
    assert.equal(greet.target, "", "a goal the AI skipped falls back to the template");
    assert.match(greet.baseline, /Not logged in this period/);
  });

  test("without AI: template baselines from the figures, empty targets; a 30-day window", async () => {
    const w = await world();
    const res = await api().post("/api/iep-plans").set(bearer(w.admin.token)).send({ kidId: w.kid.id, baselineDays: 30 });
    assert.equal(res.status, 201);
    assert.equal(res.body.aiDrafted, false);
    assert.equal(res.body.stats.totalEntries, 1);
    const req = res.body.content.goals[0];
    assert.equal(req.baseline, "Over the last 30 days, 1 attempt logged: 1 correct (1 without help); 1 at the centre, 0 at home. Correct with: Ball.");
    assert.equal(req.target, "");
    assert.match(res.body.content.presentLevels, /^Aarav has 2 active goals\. 1 attempt was logged in the last 30 days\./);
  });

  test("edit, finalise only when complete, then locked", async () => {
    const w = await world();
    const plan = (await api().post("/api/iep-plans").set(bearer(w.linked.token)).send({ kidId: w.kid.id })).body;

    const early = await api().post(`/api/iep-plans/${plan.id}/finalise`).set(bearer(w.linked.token));
    assert.equal(early.status, 409);
    assert.equal(early.body.error.code, "INCOMPLETE");
    assert.match(early.body.error.message, /a target for "Request items with two words"/);

    const content = { ...plan.content, goals: plan.content.goals.map((g: { title: string }) => ({ ...g, target: `Target for ${g.title}` })) };
    const reviewDate = new Date(Date.now() + 60 * DAY).toISOString();
    const edited = await api().patch(`/api/iep-plans/${plan.id}`).set(bearer(w.linked.token)).send({ title: "Term 1 plan", reviewDate, content });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.title, "Term 1 plan");
    assert.equal(edited.body.content.goals[1].target, "Target for Greet familiar adults");

    const fin = await api().post(`/api/iep-plans/${plan.id}/finalise`).set(bearer(w.linked.token));
    assert.equal(fin.status, 200);
    assert.equal(fin.body.status, "FINAL");
    assert.ok(fin.body.finalisedAt);

    assert.equal((await api().patch(`/api/iep-plans/${plan.id}`).set(bearer(w.linked.token)).send({ title: "x" })).status, 409);
    assert.equal((await api().delete(`/api/iep-plans/${plan.id}`).set(bearer(w.linked.token))).status, 409);
    assert.equal((await api().post(`/api/iep-plans/${plan.id}/finalise`).set(bearer(w.linked.token))).status, 409);
  });

  test("edits are checked: goals must belong to the child, the review date must be after the start", async () => {
    const w = await world();
    const plan = (await api().post("/api/iep-plans").set(bearer(w.admin.token)).send({ kidId: w.kid.id })).body;
    const otherKid = await makeKid(w.tenant.id, null, { firstName: "Noor" });
    const { goal: foreign } = await makeGoal(otherKid, await makeTaxonomy());
    const bad = { ...plan.content, goals: [{ ...plan.content.goals[0], goalId: foreign.id }] };
    assert.equal((await api().patch(`/api/iep-plans/${plan.id}`).set(bearer(w.admin.token)).send({ content: bad })).status, 400);
    assert.equal((await api().patch(`/api/iep-plans/${plan.id}`).set(bearer(w.admin.token)).send({ reviewDate: new Date(Date.now() - DAY).toISOString() })).status, 400);
    assert.equal((await api().post("/api/iep-plans").set(bearer(w.admin.token)).send({ kidId: w.kid.id, reviewDate: new Date(Date.now() - DAY).toISOString() })).status, 400);
    assert.equal((await api().delete(`/api/iep-plans/${plan.id}`).set(bearer(w.admin.token))).status, 204);
    assert.equal(await prisma.iepPlan.count(), 0);
  });

  test("share a final plan: parent sees it in the app and gets an email; drafts and unshared plans stay hidden", async () => {
    const w = await world();
    const other = await makeParent({ name: "Other" });
    const plan = (await api().post("/api/iep-plans").set(bearer(w.linked.token)).send({ kidId: w.kid.id })).body;
    assert.equal((await api().post(`/api/iep-plans/${plan.id}/share`).set(bearer(w.linked.token))).body.error.code, "NOT_FINAL");

    const content = { ...plan.content, goals: plan.content.goals.map((g: { title: string }) => ({ ...g, target: `Target for ${g.title}` })) };
    await api().patch(`/api/iep-plans/${plan.id}`).set(bearer(w.linked.token)).send({ content });
    await api().post(`/api/iep-plans/${plan.id}/finalise`).set(bearer(w.linked.token));
    assert.deepEqual((await api().get(`/api/parent-kids/${w.kid.id}/iep-plans`).set(bearer(w.fam.token))).body, [], "final but not shared");
    assert.equal((await api().post(`/api/iep-plans/${plan.id}/share`).set(bearer(w.viewer.token))).status, 403);

    const shared = await api().post(`/api/iep-plans/${plan.id}/share`).set(bearer(w.linked.token));
    assert.equal(shared.status, 200);
    assert.ok(shared.body.sharedAt && shared.body.emailedAt);
    assert.equal((await api().post(`/api/iep-plans/${plan.id}/share`).set(bearer(w.linked.token))).body.error.code, "ALREADY_SHARED");

    const mail = testOutbox.filter((m) => m.to === w.fam.parent.email);
    assert.equal(mail.length, 1);
    assert.match(mail[0].subject, /^Aarav's Individualised Education Plan from .+, Sunrise Centre$/);
    assert.match(mail[0].text, /1\. Request items with two words\n   Target: Target for Request items with two words/);
    assert.match(mail[0].text, /in Pravnya: https?:\/\//);

    const list = await api().get(`/api/parent-kids/${w.kid.id}/iep-plans`).set(bearer(w.fam.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.deepEqual(Object.keys(list.body[0]).sort(), ["authorName", "centreName", "content", "id", "planStart", "readAt", "reviewDate", "sharedAt", "title"]);
    const read = await api().post(`/api/parent-kids/${w.kid.id}/iep-plans/${plan.id}/read`).set(bearer(w.fam.token));
    assert.ok(read.body.readAt);
    assert.equal((await api().get(`/api/parent-kids/${w.kid.id}/iep-plans`).set(bearer(other.token))).status, 404);
  });

  test("a final plan for a child without a parent account can't be shared", async () => {
    const w = await world();
    const noParentKid = await makeKid(w.tenant.id, null, { firstName: "Noor" });
    await makeGoal(noParentKid, await makeTaxonomy(), { title: "Point to pictures" });
    const plan = (await api().post("/api/iep-plans").set(bearer(w.admin.token)).send({ kidId: noParentKid.id })).body;
    const content = { ...plan.content, goals: plan.content.goals.map((g: object) => ({ ...g, target: "t" })) };
    await api().patch(`/api/iep-plans/${plan.id}`).set(bearer(w.admin.token)).send({ content });
    await api().post(`/api/iep-plans/${plan.id}/finalise`).set(bearer(w.admin.token));
    const res = await api().post(`/api/iep-plans/${plan.id}/share`).set(bearer(w.admin.token));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "NO_PARENT");
  });

  test("access: unlinked therapist 403, viewer reads but can't write, other tenant 403", async () => {
    const w = await world();
    const plan = (await api().post("/api/iep-plans").set(bearer(w.admin.token)).send({ kidId: w.kid.id })).body;
    assert.equal((await api().post("/api/iep-plans").set(bearer(w.unlinked.token)).send({ kidId: w.kid.id })).status, 403);
    assert.equal((await api().get(`/api/iep-plans?kidId=${w.kid.id}`).set(bearer(w.unlinked.token))).status, 403);
    const list = await api().get(`/api/iep-plans?kidId=${w.kid.id}`).set(bearer(w.viewer.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal((await api().post(`/api/iep-plans/${plan.id}/finalise`).set(bearer(w.viewer.token))).status, 403);
    const outsider = await makeUser("TENANT_ADMIN", (await makeTenant()).id);
    assert.equal((await api().patch(`/api/iep-plans/${plan.id}`).set(bearer(outsider.token)).send({ title: "x" })).status, 403);
  });
});
