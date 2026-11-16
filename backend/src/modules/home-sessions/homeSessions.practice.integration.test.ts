import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { testOutbox } from "../therapist-invitations/invitationEmail.service";
import { linkTherapist, makeGoal, makeKid, makeParent, makeTaxonomy, makeTenant, makeTherapist } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";

// Practice sessions Pravnya puts together on the parent's request: picked from the child's goals,
// run like any session, logged, at most 2 a day; therapists see them but don't get an email each time.

async function world() {
  const tenant = await makeTenant({ name: "Sunrise Centre" });
  const fam = await makeParent({ name: "Maya" });
  const kid = await makeKid(tenant.id, fam.parent.id, { firstName: "Aarav" });
  const taxonomy = await makeTaxonomy();
  const { goal, goalItems } = await makeGoal(kid, taxonomy, { title: "Name familiar objects", evidence: [{ daysAgo: 3, centreName: "Sunrise Centre", supportLevel: "VERBAL_PROMPT" }] });
  const linked = await makeTherapist(tenant.id);
  await linkTherapist(kid.id, linked.therapist.id);
  const other = await makeParent({ name: "Other" });
  return { tenant, fam, kid, goal, goalItems, linked, other };
}
type W = Awaited<ReturnType<typeof world>>;

const url = (w: W, path: string) => `/api/parent-kids/${w.kid.id}${path}`;
const startPractice = (w: W, body: object = {}) => api().post(url(w, "/practice/start")).set(bearer(w.fam.token)).send(body);
const turn = (w: W, runId: string, choice: string) => api().post(url(w, `/session-runs/${runId}/turn`)).set(bearer(w.fam.token)).send({ choice });

describe("practice sessions made by Pravnya", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("status, then a session from the child's goals; it runs and logs like any session, kept apart from the therapist's", async () => {
    const w = await world();
    const status = await api().get(url(w, "/practice")).set(bearer(w.fam.token));
    assert.equal(status.status, 200);
    assert.deepEqual({ ...status.body, minutes: typeof status.body.minutes }, { perDay: 2, usedToday: 0, remainingToday: 2, inProgressRunId: null, available: true, minutes: "number" });

    const started = await startPractice(w);
    assert.equal(started.status, 200);
    assert.equal(started.body.title, "Practice with Aarav");
    assert.equal(started.body.step.phase, "intro");
    assert.equal(started.body.resumed, false);
    const runId = started.body.runId;

    const session = await prisma.homeSession.findFirstOrThrow({ where: { kidId: w.kid.id } });
    assert.equal(session.source, "PRAVNYA");
    assert.equal(session.status, "ACTIVE");
    assert.equal(session.authorName, "Pravnya");
    assert.equal(session.centreName, "Sunrise Centre");
    const plan = session.plan as { activities: { goalId: string; items: { label: string }[]; trialsPerItem: number; instruction: string }[] };
    assert.equal(plan.activities[0].goalId, w.goal.id);
    assert.equal(plan.activities[0].items.length, Math.min(3, w.goalItems.length));
    assert.ok(plan.activities[0].trialsPerItem >= 2);
    assert.match(plan.activities[0].instruction, /\{item\}/);

    await turn(w, runId, "ready");
    const setup = await turn(w, runId, "ready");
    assert.equal(setup.body.step.phase, "trial");
    assert.doesNotMatch(setup.body.step.lines.join(" "), /\{item\}/, "placeholders are filled in");
    const own = await turn(w, runId, "own");
    assert.equal(own.body.logged.supportLevel, "INDEPENDENT");
    assert.equal(await prisma.goalItemEvidence.count({ where: { sessionRunId: runId } }), 1);

    assert.deepEqual((await api().get(url(w, "/sessions")).set(bearer(w.fam.token))).body, [], "not listed with the therapist's sessions");
    const staff = await api().get(`/api/home-sessions?kidId=${w.kid.id}`).set(bearer(w.linked.token));
    assert.equal(staff.body[0].source, "PRAVNYA");
    assert.equal((await api().patch(`/api/home-sessions/${session.id}`).set(bearer(w.linked.token)).send({ title: "x" })).status, 409);

    const ended = await api().post(url(w, `/session-runs/${runId}/end`)).set(bearer(w.fam.token));
    assert.equal(ended.body.status, "ENDED_EARLY");
    assert.equal(testOutbox.length, 0, "no email to the therapist for each practice session");
    assert.equal((await api().post(url(w, `/sessions/${session.id}/start`)).set(bearer(w.fam.token))).status, 409, "a practice session isn't restarted");
  });

  test("starting again continues the one in progress; at most 2 a day, and one left with no tries doesn't count", async () => {
    const w = await world();
    const first = (await startPractice(w)).body.runId;
    const again = await startPractice(w);
    assert.equal(again.body.runId, first);
    assert.equal(again.body.resumed, true);
    assert.equal((await api().get(url(w, "/practice")).set(bearer(w.fam.token))).body.inProgressRunId, first);

    // Abandoned before any try: doesn't use up one of today's.
    await api().post(url(w, `/session-runs/${first}/end`)).set(bearer(w.fam.token));
    assert.equal((await api().get(url(w, "/practice")).set(bearer(w.fam.token))).body.remainingToday, 2);

    for (let n = 0; n < 2; n++) {
      const runId = (await startPractice(w)).body.runId;
      await turn(w, runId, "ready");
      await turn(w, runId, "ready");
      await turn(w, runId, "notyet");
      await api().post(url(w, `/session-runs/${runId}/end`)).set(bearer(w.fam.token));
    }
    const status = (await api().get(url(w, "/practice")).set(bearer(w.fam.token))).body;
    assert.equal(status.usedToday, 2);
    assert.equal(status.remainingToday, 0);
    const third = await startPractice(w);
    assert.equal(third.status, 409);
    assert.equal(third.body.error?.code ?? third.body.code, "DAILY_LIMIT");
  });

  test("with AI: the wording is the AI's, but the picker's items and tries are kept; Hindi on request", async () => {
    const w = await world();
    setTestAiResponse("practice-session-draft", {
      intro: "आज नाम बताने का खेल!",
      closing: "शाबाश!",
      activities: [
        {
          goalId: w.goal.id,
          type: "EXPRESSIVE_LABEL",
          items: [w.goalItems[0].id],
          trialsPerItem: 9,
          setup: "चीज़ें पास रखिए।",
          instruction: "{item} दिखाकर पूछिए: यह क्या है?",
          correctLooksLike: "5 सेकंड में बोले।",
          prompts: [{ supportLevel: "VERBAL_PROMPT", say: "पहली आवाज़ बोलिए।" }],
          errorCorrection: "शब्द बोलकर दोहराने दीजिए।",
          reinforcement: "ताली!",
          modality: "VERBAL",
          missesBeforeMovingOn: 2
        }
      ]
    });
    const started = await startPractice(w, { language: "hi" });
    assert.equal(started.body.title, "Aarav के साथ अभ्यास");
    const session = await prisma.homeSession.findFirstOrThrow({ where: { kidId: w.kid.id } });
    assert.equal(session.aiDrafted, true);
    const a = (session.plan as { activities: { instruction: string; items: unknown[]; trialsPerItem: number }[] }).activities[0];
    assert.equal(a.instruction, "{item} दिखाकर पूछिए: यह क्या है?");
    assert.equal(a.items.length, Math.min(3, w.goalItems.length), "the picker's items, not the AI's");
    assert.notEqual(a.trialsPerItem, 9);
  });

  test("nothing to practise: not available, and starting says why; another parent gets 404", async () => {
    const tenant = await makeTenant();
    const fam = await makeParent({ name: "New" });
    const kid = await makeKid(tenant.id, fam.parent.id, { firstName: "Isha" });
    const status = await api().get(`/api/parent-kids/${kid.id}/practice`).set(bearer(fam.token));
    assert.equal(status.body.available, false);
    const res = await api().post(`/api/parent-kids/${kid.id}/practice/start`).set(bearer(fam.token)).send({});
    assert.equal(res.status, 400);

    const w = await world();
    assert.equal((await api().get(url(w, "/practice")).set(bearer(w.other.token))).status, 404);
    assert.equal((await api().post(url(w, "/practice/start")).set(bearer(w.other.token)).send({})).status, 404);
  });
});
