import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { setTestAiResponse } from "../ai/ai.platform";
import { testOutbox } from "../therapist-invitations/invitationEmail.service";
import { linkTherapist, makeGoal, makeKid, makeParent, makeTaxonomy, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";

// Progress updates: staff draft (AI or template) -> edit -> send (in-app + email) -> parent reads.

async function world() {
  const tenant = await makeTenant({ name: "Sunrise Centre" });
  const fam = await makeParent({ name: "Maya" });
  const other = await makeParent({ name: "Other" });
  const kid = await makeKid(tenant.id, fam.parent.id, { firstName: "Aarav" });
  const noParentKid = await makeKid(tenant.id, null, { firstName: "Noor" });
  const taxonomy = await makeTaxonomy();
  await makeGoal(kid, taxonomy, {
    title: "Request items with two words",
    evidence: [
      { daysAgo: 2, outcome: "CORRECT", supportLevel: "INDEPENDENT", centreName: "Sunrise Centre" },
      { daysAgo: 3, outcome: "CORRECT", supportLevel: "VERBAL_PROMPT", centreName: null },
      { daysAgo: 20, outcome: "INCORRECT", supportLevel: "VERBAL_PROMPT", centreName: "Sunrise Centre" }
    ]
  });
  const admin = await makeUser("TENANT_ADMIN", tenant.id);
  const viewer = await makeUser("VIEWER", tenant.id);
  const linked = await makeTherapist(tenant.id);
  await linkTherapist(kid.id, linked.therapist.id);
  const unlinked = await makeTherapist(tenant.id);
  return { tenant, fam, other, kid, noParentKid, admin, viewer, linked, unlinked };
}

const AI_DRAFT = {
  opening: "Aarav had a good week.",
  highlights: ["Asked for a ball on his own for the first time."],
  workingOn: ["Two-word requests"],
  tryAtHome: ["Pause before giving a snack so he can ask."],
  closing: "See you on Monday."
};

describe("progress updates", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("a linked therapist drafts with AI; the body is composed and the stats come from evidence", async () => {
    const w = await world();
    setTestAiResponse("progress-update-draft", AI_DRAFT);
    const res = await api().post("/api/progress-updates").set(bearer(w.linked.token)).send({ kidId: w.kid.id, period: "week" });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "DRAFT");
    assert.equal(res.body.aiDrafted, true);
    assert.equal(res.body.centreName, "Sunrise Centre");
    assert.match(res.body.body, /^Aarav had a good week\./);
    assert.match(res.body.body, /Highlights\n• Asked for a ball/);
    assert.match(res.body.body, /Try at home\n• Pause before giving a snack/);
    assert.match(res.body.body, new RegExp(`— ${w.linked.therapist.name}$`));
    const g = res.body.stats.goals[0];
    assert.equal(res.body.stats.totalEntries, 2, "the 20-day-old entry is outside the week");
    assert.deepEqual([g.entries, g.correct, g.independent, g.atHome, g.atCentre], [2, 2, 1, 1, 1]);
    assert.deepEqual(g.firstTimeIndependent, ["Ball"]);
  });

  test("without a usable AI answer it falls back to the template, in Hindi when asked", async () => {
    const w = await world();
    const res = await api().post("/api/progress-updates").set(bearer(w.admin.token)).send({ kidId: w.kid.id, period: "month", language: "hi" });
    assert.equal(res.status, 201);
    assert.equal(res.body.aiDrafted, false);
    assert.equal(res.body.language, "hi");
    assert.match(res.body.body, /Aarav के साथ इस बार 3 बार अभ्यास दर्ज हुआ।/);
    assert.match(res.body.body, /घर पर आज़माइए/);
  });

  test("edit a draft, send it: parent sees it in the app and gets an email; then it is locked", async () => {
    const w = await world();
    const draft = (await api().post("/api/progress-updates").set(bearer(w.linked.token)).send({ kidId: w.kid.id })).body;

    const edited = await api().patch(`/api/progress-updates/${draft.id}`).set(bearer(w.linked.token)).send({ body: "Edited update." });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.body, "Edited update.");

    assert.deepEqual((await api().get(`/api/parent-kids/${w.kid.id}/updates`).set(bearer(w.fam.token))).body, [], "drafts are invisible to parents");

    const sent = await api().post(`/api/progress-updates/${draft.id}/send`).set(bearer(w.linked.token));
    assert.equal(sent.status, 200);
    assert.equal(sent.body.status, "SENT");
    assert.ok(sent.body.sentAt && sent.body.emailedAt);

    const mail = testOutbox.filter((m) => m.to === w.fam.parent.email);
    assert.equal(mail.length, 1);
    assert.match(mail[0].subject, /An update on Aarav from .+, Sunrise Centre/);
    assert.match(mail[0].text, /^Edited update\.\n\nSee Aarav's progress in Pravnya: https?:\/\//);

    const list = await api().get(`/api/parent-kids/${w.kid.id}/updates`).set(bearer(w.fam.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.deepEqual(Object.keys(list.body[0]).sort(), ["authorName", "body", "centreName", "id", "language", "periodEnd", "periodStart", "readAt", "sentAt"]);
    assert.equal(list.body[0].readAt, null);

    const read = await api().post(`/api/parent-kids/${w.kid.id}/updates/${draft.id}/read`).set(bearer(w.fam.token));
    assert.equal(read.status, 200);
    assert.ok(read.body.readAt);

    assert.equal((await api().patch(`/api/progress-updates/${draft.id}`).set(bearer(w.linked.token)).send({ body: "x" })).status, 409);
    assert.equal((await api().post(`/api/progress-updates/${draft.id}/send`).set(bearer(w.linked.token))).status, 409);
    assert.equal((await api().delete(`/api/progress-updates/${draft.id}`).set(bearer(w.linked.token))).status, 409);
  });

  test("a draft can be deleted; a kid without a parent account can't be sent to", async () => {
    const w = await world();
    const d1 = (await api().post("/api/progress-updates").set(bearer(w.admin.token)).send({ kidId: w.kid.id })).body;
    assert.equal((await api().delete(`/api/progress-updates/${d1.id}`).set(bearer(w.admin.token))).status, 204);
    assert.equal(await prisma.progressUpdate.count(), 0);

    const d2 = (await api().post("/api/progress-updates").set(bearer(w.admin.token)).send({ kidId: w.noParentKid.id })).body;
    const res = await api().post(`/api/progress-updates/${d2.id}/send`).set(bearer(w.admin.token));
    assert.equal(res.status, 409);
    assert.equal((await prisma.progressUpdate.findUniqueOrThrow({ where: { id: d2.id } })).status, "DRAFT");
  });

  test("access: unlinked therapist 403, viewer can read but not write, other tenant 403, other parent 404", async () => {
    const w = await world();
    const draft = (await api().post("/api/progress-updates").set(bearer(w.admin.token)).send({ kidId: w.kid.id })).body;
    assert.equal((await api().post("/api/progress-updates").set(bearer(w.unlinked.token)).send({ kidId: w.kid.id })).status, 403);
    assert.equal((await api().get(`/api/progress-updates?kidId=${w.kid.id}`).set(bearer(w.unlinked.token))).status, 403);
    assert.equal((await api().get(`/api/progress-updates?kidId=${w.kid.id}`).set(bearer(w.viewer.token))).status, 200);
    assert.equal((await api().post(`/api/progress-updates/${draft.id}/send`).set(bearer(w.viewer.token))).status, 403);

    const otherTenant = await makeTenant();
    const outsider = await makeUser("TENANT_ADMIN", otherTenant.id);
    assert.equal((await api().patch(`/api/progress-updates/${draft.id}`).set(bearer(outsider.token)).send({ body: "x" })).status, 403);

    await api().post(`/api/progress-updates/${draft.id}/send`).set(bearer(w.admin.token));
    assert.equal((await api().get(`/api/parent-kids/${w.kid.id}/updates`).set(bearer(w.other.token))).status, 404);
    assert.equal((await api().post(`/api/parent-kids/${w.kid.id}/updates/${randomUUID()}/read`).set(bearer(w.fam.token))).status, 404);
  });

  test("due list: kids with a parent and new entries, not sent in the last week, come first", async () => {
    const w = await world();
    const res = await api().get("/api/progress-updates/due").set(bearer(w.admin.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1, "kids without a parent account aren't listed");
    assert.equal(res.body[0].kidId, w.kid.id);
    assert.equal(res.body[0].isDue, true);
    assert.equal(res.body[0].newEntries, 3);

    const d = (await api().post("/api/progress-updates").set(bearer(w.admin.token)).send({ kidId: w.kid.id })).body;
    await api().post(`/api/progress-updates/${d.id}/send`).set(bearer(w.admin.token));
    const after = (await api().get("/api/progress-updates/due").set(bearer(w.admin.token))).body;
    assert.equal(after[0].isDue, false);
    assert.equal(after[0].newEntries, 0);
  });
});
