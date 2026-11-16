import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { testOutbox } from "../therapist-invitations/invitationEmail.service";
import { makeGoal, makeKid, makeParent, makeRetailTenant, makeTaxonomy, makeTenant, TEST_PASSWORD } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";
import { runParentPurge } from "./parentAccount.purge";

// Parent account: delete with a 30-day grace period (cancellable), the purge, and the data export.

const DAY = 86_400_000;

async function world() {
  const retail = await makeRetailTenant();
  const centre = await makeTenant({ name: "Sunrise Centre" });
  const fam = await makeParent({ name: "Maya" });
  const ownKid = await makeKid(retail.id, fam.parent.id, { firstName: "Aarav" });
  const centreKid = await makeKid(centre.id, fam.parent.id, { firstName: "Isha" });
  const taxonomy = await makeTaxonomy();
  await makeGoal(ownKid, taxonomy, { title: "Request items with two words", evidence: [{ daysAgo: 1, outcome: "CORRECT", supportLevel: "INDEPENDENT" }] });
  const { goal: centreGoal } = await makeGoal(centreKid, taxonomy, { title: "Greet familiar adults", evidence: [{ daysAgo: 2, centreName: "Sunrise Centre" }] });
  for (const kidId of [ownKid.id, centreKid.id]) {
    await prisma.companionMessage.create({ data: { kidId, role: "PARENT", content: "Is that progress?" } });
    await prisma.scheduleSlot.create({ data: { kidId, label: "Speech therapy", dayOfWeek: "Mon", startTime: "10:00" } });
  }
  const other = await makeParent({ name: "Other" });
  const otherKid = await makeKid(retail.id, other.parent.id, { firstName: "Noor" });
  return { fam, ownKid, centreKid, centreGoal, other, otherKid };
}

describe("parent account", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("asking to delete needs the password, schedules it 30 days out, emails, and shows in /me", async () => {
    const w = await world();
    const wrong = await api().post("/api/parent-account/delete").set(bearer(w.fam.token)).send({ password: "nope" });
    assert.equal(wrong.status, 401);

    const res = await api().post("/api/parent-account/delete").set(bearer(w.fam.token)).send({ password: TEST_PASSWORD });
    assert.equal(res.status, 200);
    const days = (new Date(res.body.scheduledPurgeAt).getTime() - Date.now()) / DAY;
    assert.ok(days > 29.9 && days <= 30);

    const me = await api().get("/api/parent-auth/me").set(bearer(w.fam.token));
    assert.equal(me.body.scheduledPurgeAt, res.body.scheduledPurgeAt);
    const mail = testOutbox.filter((m) => m.to === w.fam.parent.email);
    assert.equal(mail.at(-1)!.subject, "Your Pravnya account will be deleted");
    assert.match(mail.at(-1)!.text, /Keep my account/);

    const again = await api().post("/api/parent-account/delete").set(bearer(w.fam.token)).send({ password: TEST_PASSWORD });
    assert.equal(again.body.scheduledPurgeAt, res.body.scheduledPurgeAt, "asking twice doesn't move the date");
  });

  test("cancelling keeps the account; the purge leaves it alone", async () => {
    const w = await world();
    await api().post("/api/parent-account/delete").set(bearer(w.fam.token)).send({ password: TEST_PASSWORD });
    const res = await api().post("/api/parent-account/cancel-deletion").set(bearer(w.fam.token));
    assert.deepEqual(res.body, { cancelled: true });
    assert.equal((await api().get("/api/parent-auth/me").set(bearer(w.fam.token))).body.scheduledPurgeAt, null);
    await runParentPurge(new Date(Date.now() + 40 * DAY));
    assert.ok(await prisma.parent.findUnique({ where: { id: w.fam.parent.id } }));
  });

  test("before the date nothing is deleted; after it, own children go entirely and centre children are unlinked", async () => {
    const w = await world();
    await api().post("/api/parent-account/delete").set(bearer(w.fam.token)).send({ password: TEST_PASSWORD });

    assert.deepEqual(await runParentPurge(new Date(Date.now() + 29 * DAY)), { purged: 0 });
    assert.ok(await prisma.parent.findUnique({ where: { id: w.fam.parent.id } }));

    assert.deepEqual(await runParentPurge(new Date(Date.now() + 31 * DAY)), { purged: 1 });
    assert.equal(await prisma.parent.findUnique({ where: { id: w.fam.parent.id } }), null);
    assert.equal(await prisma.kid.findUnique({ where: { id: w.ownKid.id } }), null, "the child they registered themselves is gone");
    assert.equal(await prisma.goal.count({ where: { kidId: w.ownKid.id } }), 0);

    const centreKid = await prisma.kid.findUniqueOrThrow({ where: { id: w.centreKid.id } });
    assert.equal(centreKid.parentId, null, "the centre's child is unlinked, not deleted");
    assert.equal(await prisma.goalItemEvidence.count({ where: { goalItem: { goalId: w.centreGoal.id } } }), 1, "the centre keeps its records");
    assert.equal(await prisma.companionMessage.count({ where: { kidId: w.centreKid.id } }), 0, "the parent's chat is deleted");
    assert.equal(await prisma.scheduleSlot.count({ where: { kidId: w.centreKid.id } }), 0, "the parent's schedule is deleted");

    assert.ok(await prisma.kid.findUnique({ where: { id: w.otherKid.id } }), "other families are untouched");
    assert.equal(testOutbox.at(-1)!.subject, "Your Pravnya account has been deleted");
    assert.equal((await api().get("/api/parent-auth/me").set(bearer(w.fam.token))).status, 401, "the old session no longer works");
  });

  test("export: a short-lived link downloads everything the parent can see, and nothing of other families", async () => {
    const w = await world();
    const link = await api().post("/api/parent-account/export-link").set(bearer(w.fam.token));
    assert.equal(link.status, 200);
    assert.match(link.body.path, /^\/api\/parent-account\/export\?token=/);

    const res = await api().get(link.body.path);
    assert.equal(res.status, 200);
    assert.match(res.headers["content-disposition"], /attachment; filename="pravnya-data-\d{4}-\d{2}-\d{2}\.json"/);
    const data = JSON.parse(res.text);
    assert.equal(data.account.email, w.fam.parent.email);
    assert.deepEqual(data.children.map((c: { firstName: string }) => c.firstName).sort(), ["Aarav", "Isha"]);
    const aarav = data.children.find((c: { firstName: string }) => c.firstName === "Aarav");
    assert.equal(aarav.goals[0].title, "Request items with two words");
    assert.equal(aarav.goals[0].entries[0].outcome, "CORRECT");
    assert.equal(aarav.conversationWithPravnya[0].from, "you");
    assert.equal(aarav.weeklySchedule[0].label, "Speech therapy");
    assert.ok(!res.text.includes("Noor"));

    assert.equal((await api().get("/api/parent-account/export?token=nonsense")).status, 401);
    assert.equal((await api().get(`/api/parent-account/export?token=${encodeURIComponent(w.fam.token)}`)).status, 401, "a login token isn't a download link");
    assert.equal((await api().post("/api/parent-account/export-link")).status, 401);
  });
});
