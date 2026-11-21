import { randomUUID } from "node:crypto";
import { lastTokenRequest } from "./homeSessions.call";
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

  test("the parent is told what to do, then reports every try in one go: each is logged, the end sends the therapist a summary", async () => {
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
    const turn = (body: object) => api().post(parentUrl(w, `/session-runs/${runId}/turn`)).set(bearer(w.fam.token)).send(body);

    const explain = await turn({ choice: "ready" });
    assert.equal(explain.body.step.phase, "explain");
    assert.ok(explain.body.step.guide.say);
    const report = await turn({ choice: "start" });
    assert.equal(report.body.step.phase, "report");
    const [ball, cup] = report.body.step.report.items as { goalItemId: string; label: string }[];
    assert.equal(ball.label, "Ball");
    assert.equal(report.body.step.report.triesPerItem, 2);

    const tooMany = await turn({ report: { items: [{ goalItemId: ball.goalItemId, tries: ["own", "own", "own"] }], help: null } });
    assert.equal(tooMany.status, 400);
    const done = await turn({ report: { items: [{ goalItemId: ball.goalItemId, tries: ["own", "help"] }, { goalItemId: cup.goalItemId, tries: ["notyet", "own"] }], help: "VERBAL_PROMPT" } });
    assert.equal(done.status, 200);
    assert.equal(done.body.logged.length, 4);
    // 1 activity -> its report finishes the session.
    assert.equal(done.body.status, "COMPLETED");
    const last = await api().get(parentUrl(w, `/session-runs/${runId}`)).set(bearer(w.fam.token));
    assert.equal(last.body.status, "COMPLETED");
    assert.equal(last.body.step.phase, "done");
    assert.match(last.body.summary, /Name familiar objects: 4 tries, 2 on their own, 1 with help, 1 not yet\./);

    const evidence = await prisma.goalItemEvidence.findMany({ where: { sessionRunId: runId }, orderBy: { logDate: "asc" } });
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

    assert.equal((await turn({ choice: "ready" })).status, 409, "a finished run takes no more turns");
    const after = (await api().get(parentUrl(w, "/sessions")).set(bearer(w.fam.token))).body[0];
    assert.equal(after.dueToday, false, "done for today");
    assert.equal(after.lastRun.status, "COMPLETED");

    const staff = await api().get(`/api/home-sessions?kidId=${w.kid.id}`).set(bearer(w.linked.token));
    assert.equal(staff.body[0].runs[0].results.length, 4);
  });

  test("typed and spoken replies move the session on or are answered; without AI, tap instead", async () => {
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
    assert.equal(ready.body.step.phase, "explain");

    setTestAiResponse("home-session-turn", { intent: "answer", choice: null, reply: "Use a toy he loves as the reward." });
    const q = await send({ audio: { mimeType: "audio/webm", base64: Buffer.from("fake").toString("base64") } });
    assert.equal(q.body.reply, "Use a toy he loves as the reward.");
    assert.equal(q.body.step.phase, "explain");
    assert.deepEqual(q.body.logged, []);

    setTestAiResponse("home-session-turn", { intent: "choice", choice: "own", reply: null });
    assert.equal((await send({ text: "he did it" })).body.step.phase, "explain", "a choice that isn't offered changes nothing");
    await send({ choice: "start" });
    assert.equal(await prisma.goalItemEvidence.count({ where: { sessionRunId: runId } }), 0);
  });

  test("'ball 2 of 3' is turned into a filled-in report for the parent to check; nothing is saved until they send it", async () => {
    const w = await world();
    const s = await published(w);
    const runId = (await api().post(parentUrl(w, `/sessions/${s.id}/start`)).set(bearer(w.fam.token))).body.runId;
    const send = (body: object) => api().post(parentUrl(w, `/session-runs/${runId}/turn`)).set(bearer(w.fam.token)).send(body);
    const draft = (body: object) => api().post(parentUrl(w, `/session-runs/${runId}/report-draft`)).set(bearer(w.fam.token)).send(body);

    assert.equal((await draft({ text: "ball 2 of 2" })).status, 400, "only on the report step");
    await send({ choice: "ready" });
    const step = (await send({ choice: "start" })).body.step;
    const [ball, cup] = step.report.items as { goalItemId: string }[];

    const none = await draft({ text: "ball 2 of 2" });
    assert.equal(none.body.report, null);
    assert.match(none.body.reply, /mark the tries/);

    setTestAiResponse("home-session-report", {
      items: [
        { goalItemId: ball.goalItemId, tries: ["own", "own", "own"] },
        { goalItemId: cup.goalItemId, tries: ["help"] }
      ],
      help: "PHYSICAL_PROMPT",
      reply: "Ball twice on his own, cup once with help."
    });
    const filled = await draft({ text: "ball 2 of 2, cup once when I guided his hand" });
    assert.equal(filled.status, 200);
    assert.deepEqual(filled.body.report.items, [
      { goalItemId: ball.goalItemId, tries: ["own", "own"] },
      { goalItemId: cup.goalItemId, tries: ["help"] }
    ]);
    assert.equal(filled.body.report.help, "PHYSICAL_PROMPT");
    assert.equal(filled.body.reply, "Ball twice on his own, cup once with help.");
    assert.equal(await prisma.goalItemEvidence.count({ where: { sessionRunId: runId } }), 0);

    const saved = await send({ report: filled.body.report });
    assert.equal(saved.body.logged.length, 3);
    assert.equal(saved.body.status, "COMPLETED");
  });

  test("ending early keeps what was reported and still tells the therapist; a later start is a new run", async () => {
    const w = await world();
    setTestAiResponse("home-session-draft", aiPlan(w));
    const d = (await api().post("/api/home-sessions/draft").set(bearer(w.linked.token)).send({ kidId: w.kid.id, goalIds: [w.goal.id] })).body;
    const two = { ...d.plan, activities: [d.plan.activities[0], { ...d.plan.activities[0], key: randomUUID() }] };
    assert.equal((await api().patch(`/api/home-sessions/${d.id}`).set(bearer(w.linked.token)).send({ plan: two })).status, 200);
    await api().post(`/api/home-sessions/${d.id}/publish`).set(bearer(w.linked.token));

    const runId = (await api().post(parentUrl(w, `/sessions/${d.id}/start`)).set(bearer(w.fam.token))).body.runId;
    const turn = (body: object) => api().post(parentUrl(w, `/session-runs/${runId}/turn`)).set(bearer(w.fam.token)).send(body);
    await turn({ choice: "ready" });
    const step = (await turn({ choice: "start" })).body.step;
    const next = await turn({ report: { items: [{ goalItemId: step.report.items[0].goalItemId, tries: ["own"] }], help: null } });
    assert.equal(next.body.step.phase, "explain", "on to the second activity");
    assert.equal(next.body.step.activityLabel, "Activity 2 of 2");

    const again = await api().post(parentUrl(w, `/sessions/${d.id}/start`)).set(bearer(w.fam.token));
    assert.equal(again.body.runId, runId, "an unfinished run is resumed");
    assert.equal(again.body.resumed, true);
    assert.equal(again.body.step.phase, "explain");

    const ended = await api().post(parentUrl(w, `/session-runs/${runId}/end`)).set(bearer(w.fam.token));
    assert.equal(ended.body.status, "ENDED_EARLY");
    assert.match(testOutbox.at(-1)!.subject, /did part of/);
    const fresh = await api().post(parentUrl(w, `/sessions/${d.id}/start`)).set(bearer(w.fam.token));
    assert.notEqual(fresh.body.runId, runId);
  });

  test("Call Pravnya: a short-lived token locked to Pravnya's instructions for where the session is, with a per-run limit", async () => {
    const w = await world();
    const s = await published(w);
    const runId = (await api().post(parentUrl(w, `/sessions/${s.id}/start`)).set(bearer(w.fam.token))).body.runId;
    const call = () => api().post(parentUrl(w, `/session-runs/${runId}/call`)).set(bearer(w.fam.token));

    const first = await call();
    assert.equal(first.status, 200);
    assert.equal(first.body.token, "auth_tokens/test-call-token");
    assert.equal(first.body.model, "gemini-3.8-live");
    assert.equal(first.body.apiVersion, "v1beta");
    assert.equal(first.body.step.phase, "intro");
    const locked = lastTokenRequest!.config;
    assert.match(String(locked.systemInstruction), /Aarav/);
    assert.match(String(locked.systemInstruction), /Name familiar objects/);
    assert.match(String(locked.systemInstruction), /the call has just started/);
    const tools = (locked.tools as { functionDeclarations: { name: string }[] }[])[0].functionDeclarations.map((t) => t.name);
    assert.deepEqual(tools, ["ready_for_activity", "start_playing", "record_try", "undo_last_try", "save_activity", "skip_activity", "end_session"]);

    // Reconnecting mid-activity: the instructions say where they are.
    await api().post(parentUrl(w, `/session-runs/${runId}/turn`)).set(bearer(w.fam.token)).send({ choice: "ready" });
    await api().post(parentUrl(w, `/session-runs/${runId}/turn`)).set(bearer(w.fam.token)).send({ choice: "start" });
    assert.equal((await call()).body.step.phase, "report");
    assert.match(String(lastTokenRequest!.config.systemInstruction), /in the middle of activity 1/);

    for (let n = 2; n < 8; n++) assert.equal((await call()).status, 200);
    const limited = await call();
    assert.equal(limited.status, 409);
    assert.equal(limited.body.code ?? limited.body.error?.code, "CALL_LIMIT");
    assert.equal((await api().post(`/api/parent-kids/${w.kid.id}/session-runs/${runId}/call`).set(bearer(w.other.token))).status, 404);
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
