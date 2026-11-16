import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { testOutbox } from "../therapist-invitations/invitationEmail.service";
import { linkTherapist, makeGoal, makeKid, makeParent, makeTaxonomy, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";

// Home sessions: a therapist builds a session from goals (AI or template), publishes it; the parent
// runs it turn by turn (taps, typed or spoken replies), every try is logged; the therapist gets a summary.

async function world() {
  const tenant = await makeTenant({ name: "Sunrise Centre" });
  const fam = await makeParent({ name: "Maya" });
  const kid = await makeKid(tenant.id, fam.parent.id, { firstName: "Aarav" });
  const taxonomy = await makeTaxonomy();
  const { goal, goalItems } = await makeGoal(kid, taxonomy, { title: "Name familiar objects", evidence: [{ daysAgo: 3, centreName: "Sunrise Centre" }] });
  const emptyGoal = await prisma.goal.create({ data: { tenantId: tenant.id, kidId: kid.id, canonicalSkillId: taxonomy.skill.id, disciplineId: taxonomy.discipline.id, modality: "VERBAL", title: "No items yet" } });
  const linked = await makeTherapist(tenant.id);
  await linkTherapist(kid.id, linked.therapist.id);
  const viewer = await makeUser("VIEWER", tenant.id);
  const other = await makeParent({ name: "Other" });
  return { tenant, fam, kid, goal, goalItems, emptyGoal, linked, viewer, other };
}

type W = Awaited<ReturnType<typeof world>>;

const aiPlan = (w: W) => ({
  intro: "Let's play a naming game!",
  closing: "Great job today!",
  activities: [
    {
      goalId: w.goal.id,
      type: "EXPRESSIVE_LABEL",
      items: [w.goalItems[0].id, w.goalItems[1].id],
      trialsPerItem: 2,
      setup: "Put the ball and cup on the table.",
      instruction: "Hold up the {item} and ask \"What's this?\"",
      correctLooksLike: "Says the word within 5 seconds.",
      prompts: [
        { supportLevel: "VERBAL_PROMPT", say: "Say the first sound." },
        { supportLevel: "PHYSICAL_PROMPT", say: "Guide their hand." }
      ],
      errorCorrection: "Say the word and let them copy.",
      reinforcement: "A high five.",
      modality: "VERBAL",
      missesBeforeMovingOn: 2
    }
  ]
});

async function published(w: W) {
  setTestAiResponse("home-session-draft", aiPlan(w));
  const draft = (await api().post("/api/home-sessions/draft").set(bearer(w.linked.token)).send({ kidId: w.kid.id, goalIds: [w.goal.id], schedule: { kind: "weekly", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], until: null } })).body;
  await api().post(`/api/home-sessions/${draft.id}/publish`).set(bearer(w.linked.token));
  return draft;
}

const parentUrl = (w: W, path: string) => `/api/parent-kids/${w.kid.id}${path}`;

describe("home sessions", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("a therapist drafts with AI: items resolved to labels, keys added; drafts are hidden from parents", async () => {
    const w = await world();
    setTestAiResponse("home-session-draft", aiPlan(w));
    const res = await api().post("/api/home-sessions/draft").set(bearer(w.linked.token)).send({ kidId: w.kid.id, goalIds: [w.goal.id] });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "DRAFT");
    assert.equal(res.body.aiDrafted, true);
    assert.equal(res.body.title, "Aarav's home practice");
    assert.deepEqual(res.body.schedule, { kind: "once" });
    const a = res.body.plan.activities[0];
    assert.equal(a.goalTitle, "Name familiar objects");
    assert.deepEqual(a.items.map((i: { label: string }) => i.label), ["Ball", "Cup"]);
    assert.match(a.key, /^[0-9a-f-]{36}$/);
    assert.deepEqual((await api().get(parentUrl(w, "/sessions")).set(bearer(w.fam.token))).body, []);
  });

  test("without AI: a template plan; goals with no items are left out, and all-empty is refused", async () => {
    const w = await world();
    const res = await api().post("/api/home-sessions/draft").set(bearer(w.linked.token)).send({ kidId: w.kid.id, goalIds: [w.goal.id, w.emptyGoal.id], language: "hi" });
    assert.equal(res.status, 201);
    assert.equal(res.body.aiDrafted, false);
    assert.deepEqual(res.body.skippedGoals, ["No items yet"]);
    assert.equal(res.body.plan.activities.length, 1);
    assert.match(res.body.plan.intro, /Aarav/);
    assert.equal((await api().post("/api/home-sessions/draft").set(bearer(w.linked.token)).send({ kidId: w.kid.id, goalIds: [w.emptyGoal.id] })).status, 400);
  });

  test("edits are checked against the child's goals and items; viewers can't write", async () => {
    const w = await world();
    const s = await published(w);
    const otherKid = await makeKid(w.tenant.id, null, { firstName: "Noor" });
    const { goalItems: foreign } = await makeGoal(otherKid, await makeTaxonomy());
    const bad = { ...s.plan, activities: [{ ...s.plan.activities[0], items: [{ goalItemId: foreign[0].id, label: "x" }] }] };
    assert.equal((await api().patch(`/api/home-sessions/${s.id}`).set(bearer(w.linked.token)).send({ plan: bad })).status, 400);
    const ok = await api().patch(`/api/home-sessions/${s.id}`).set(bearer(w.linked.token)).send({ title: "Naming game", plan: { ...s.plan, activities: [{ ...s.plan.activities[0], trialsPerItem: 1 }] } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.plan.activities[0].trialsPerItem, 1);
    assert.equal((await api().post("/api/home-sessions/draft").set(bearer(w.viewer.token)).send({ kidId: w.kid.id, goalIds: [w.goal.id] })).status, 403);
    assert.equal((await api().get(`/api/home-sessions?kidId=${w.kid.id}`).set(bearer(w.viewer.token))).status, 200);
  });

  test("the parent runs it by tapping: every try is logged, the end sends the therapist a summary", async () => {
    const w = await world();
    const s = await published(w);
    const list = await api().get(parentUrl(w, "/sessions")).set(bearer(w.fam.token));
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].dueToday, true);
    assert.deepEqual(list.body[0].activities, ["Name familiar objects"]);

    const started = await api().post(parentUrl(w, `/sessions/${s.id}/start`)).set(bearer(w.fam.token));
    assert.equal(started.status, 200);
    assert.equal(started.body.step.phase, "intro");
    const runId = started.body.runId;
    const turn = (choice: string) => api().post(parentUrl(w, `/session-runs/${runId}/turn`)).set(bearer(w.fam.token)).send({ choice });

    await turn("ready");
    await turn("ready");
    const own = await turn("own");
    assert.equal(own.body.logged.outcome, "CORRECT");
    assert.equal(own.body.step.item, "Ball");
    await turn("help");
    await turn("help:VERBAL_PROMPT");
    await turn("notyet");
    assert.equal((await turn("own")).status, 200);
    // 2 items x 2 tries -> the 4th try finishes the only activity.
    const last = await api().get(parentUrl(w, `/session-runs/${runId}`)).set(bearer(w.fam.token));
    assert.equal(last.body.status, "COMPLETED");
    assert.equal(last.body.step.phase, "done");
    assert.match(last.body.summary, /Name familiar objects: 4 tries, 2 on their own, 1 with help, 1 not yet\./);

    const evidence = await prisma.goalItemEvidence.findMany({ where: { sessionRunId: runId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(evidence.map((e) => [e.outcome, e.supportLevel, e.centreId, e.centreName]), [
      ["CORRECT", "INDEPENDENT", null, null],
      ["CORRECT", "VERBAL_PROMPT", null, null],
      ["INCORRECT", "UNKNOWN", null, null],
      ["CORRECT", "INDEPENDENT", null, null]
    ]);

    const mail = testOutbox.filter((m) => m.to === w.linked.user.email);
    assert.equal(mail.length, 1);
    assert.equal(mail[0].subject, `Aarav did "Aarav's home practice" at home`);
    assert.match(mail[0].text, /On their own: 50% of tries\./);
    assert.match(mail[0].text, /\/tenant\/kids\//);

    assert.equal((await turn("ready")).status, 409, "a finished run takes no more turns");
    const after = (await api().get(parentUrl(w, "/sessions")).set(bearer(w.fam.token))).body[0];
    assert.equal(after.dueToday, false, "done for today");
    assert.equal(after.lastRun.status, "COMPLETED");

    const staff = await api().get(`/api/home-sessions?kidId=${w.kid.id}`).set(bearer(w.linked.token));
    assert.equal(staff.body[0].runs[0].results.length, 4);
  });

  test("typed and spoken replies are interpreted into a choice or answered; without AI, tap instead", async () => {
    const w = await world();
    const s = await published(w);
    const runId = (await api().post(parentUrl(w, `/sessions/${s.id}/start`)).set(bearer(w.fam.token))).body.runId;
    const send = (body: object) => api().post(parentUrl(w, `/session-runs/${runId}/turn`)).set(bearer(w.fam.token)).send(body);

    const unclear = await send({ text: "ok we're set" });
    assert.match(unclear.body.reply, /tap one of the buttons/);
    assert.equal(unclear.body.step.phase, "intro", "nothing changes");

    setTestAiResponse("home-session-turn", { intent: "choice", choice: "ready", reply: "Lovely." });
    const ready = await send({ text: "ok we're set" });
    assert.equal(ready.body.reply, "Lovely.");
    assert.equal(ready.body.step.phase, "setup");
    await send({ choice: "ready" });

    setTestAiResponse("home-session-turn", { intent: "answer", choice: null, reply: "It's fine to take a short break." });
    const q = await send({ audio: { mimeType: "audio/webm", base64: Buffer.from("fake").toString("base64") } });
    assert.equal(q.body.reply, "It's fine to take a short break.");
    assert.equal(q.body.step.phase, "trial");
    assert.equal(q.body.logged, null);

    setTestAiResponse("home-session-turn", { intent: "choice", choice: "help:PHYSICAL_PROMPT", reply: null });
    assert.equal((await send({ text: "I had to guide his hand" })).body.logged, null, "a help level isn't offered on the try step itself");

    setTestAiResponse("home-session-turn", { intent: "choice", choice: "own", reply: "Brilliant!" });
    const own = await send({ text: "he said ball all by himself" });
    assert.equal(own.body.logged.supportLevel, "INDEPENDENT");
    assert.equal(await prisma.goalItemEvidence.count({ where: { sessionRunId: runId } }), 1);
  });

  test("ending early keeps what was logged and still tells the therapist; a later start is a new run", async () => {
    const w = await world();
    const s = await published(w);
    const runId = (await api().post(parentUrl(w, `/sessions/${s.id}/start`)).set(bearer(w.fam.token))).body.runId;
    const turn = (choice: string) => api().post(parentUrl(w, `/session-runs/${runId}/turn`)).set(bearer(w.fam.token)).send({ choice });
    await turn("ready");
    await turn("ready");
    await turn("own");

    const again = await api().post(parentUrl(w, `/sessions/${s.id}/start`)).set(bearer(w.fam.token));
    assert.equal(again.body.runId, runId, "an unfinished run is resumed");
    assert.equal(again.body.resumed, true);

    const ended = await api().post(parentUrl(w, `/session-runs/${runId}/end`)).set(bearer(w.fam.token));
    assert.equal(ended.body.status, "ENDED_EARLY");
    assert.match(testOutbox.at(-1)!.subject, /did part of/);
    const fresh = await api().post(parentUrl(w, `/sessions/${s.id}/start`)).set(bearer(w.fam.token));
    assert.notEqual(fresh.body.runId, runId);
  });

  test("access: another parent 404; archived sessions disappear; only drafts can be deleted", async () => {
    const w = await world();
    const s = await published(w);
    assert.equal((await api().get(`/api/parent-kids/${w.kid.id}/sessions`).set(bearer(w.other.token))).status, 404);
    assert.equal((await api().post(`/api/parent-kids/${w.kid.id}/sessions/${s.id}/start`).set(bearer(w.other.token))).status, 404);
    assert.equal((await api().delete(`/api/home-sessions/${s.id}`).set(bearer(w.linked.token))).status, 409);
    await api().post(`/api/home-sessions/${s.id}/archive`).set(bearer(w.linked.token));
    assert.deepEqual((await api().get(parentUrl(w, "/sessions")).set(bearer(w.fam.token))).body, []);
  });
});
