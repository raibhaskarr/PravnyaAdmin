import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { hashToken } from "../../common/invitations/invitationToken";
import { testOutbox } from "../therapist-invitations/invitationEmail.service";
import { linkTherapist, makeInvitation, makeKid, makeParent, makeRetailTenant, makeTenant, makeTherapist, makeUser } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer, expectParentAuthRequired } from "../../test/http";

// A parent managing their child's care team: linked therapists, invitations (send / revoke /
// resend) and unlinking.

async function world() {
  const retail = await makeRetailTenant();
  const tenant = await makeTenant({ name: "Bright Steps Clinic" });
  const a = await makeParent({ name: "Parent A" });
  const b = await makeParent({ name: "Parent B" });
  const kidA = await makeKid(tenant.id, a.parent.id, { firstName: "Alex" });
  const kidA2 = await makeKid(tenant.id, a.parent.id, { firstName: "Ari" });
  const kidB = await makeKid(tenant.id, b.parent.id, { firstName: "Blake" });
  const { token: staffToken } = await makeUser("TENANT_ADMIN", tenant.id);
  return { retail, tenant, a, b, kidA, kidA2, kidB, staffToken };
}

const tokenFromUrl = (url: string) => decodeURIComponent(url.split("/invite/")[1]);

describe("parent care team: therapists and invitations", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  describe("GET /:kidId/therapists", () => {
    test("lists only therapists linked to this kid, with tenant and disciplines", async () => {
      const w = await world();
      const { therapist: t1 } = await makeTherapist(w.tenant.id);
      const { therapist: t2 } = await makeTherapist(w.tenant.id);
      await linkTherapist(w.kidA.id, t1.id);
      await linkTherapist(w.kidA2.id, t2.id);
      await linkTherapist(w.kidB.id, t2.id);
      const res = await api().get(`/api/parent-kids/${w.kidA.id}/therapists`).set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, [
        { id: t1.id, name: t1.name, disciplineIds: [], status: t1.status, tenant: { id: w.tenant.id, name: "Bright Steps Clinic" } }
      ]);
    });

    test("empty care team -> []", async () => {
      const w = await world();
      const res = await api().get(`/api/parent-kids/${w.kidA.id}/therapists`).set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    test("400 non-uuid kid; 404 other family / unknown kid; 401 without a parent token", async () => {
      const w = await world();
      assert.equal((await api().get(`/api/parent-kids/abc/therapists`).set(bearer(w.a.token))).status, 400);
      assert.equal((await api().get(`/api/parent-kids/${w.kidB.id}/therapists`).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().get(`/api/parent-kids/${randomUUID()}/therapists`).set(bearer(w.a.token))).status, 404);
      await expectParentAuthRequired("get", `/api/parent-kids/${w.kidA.id}/therapists`, w.staffToken);
    });
  });

  describe("GET /:kidId/therapist-invitations", () => {
    test("lists both admin-sent and parent-sent invitations for this kid only, newest first", async () => {
      const w = await world();
      const adminSent = await makeInvitation(w.kidA, { email: "first@test.local" });
      await new Promise((r) => setTimeout(r, 5));
      const parentSent = await makeInvitation(w.kidA, { email: "second@test.local", invitedByParentId: w.a.parent.id, tenantId: w.retail.id });
      await makeInvitation(w.kidA2, { email: "sibling@test.local" });
      await makeInvitation(w.kidB, { email: "other-family@test.local" });
      const res = await api().get(`/api/parent-kids/${w.kidA.id}/therapist-invitations`).set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.map((i: { id: string }) => i.id), [parentSent.id, adminSent.id]);
      assert.equal(res.body[0].email, "second@test.local");
      assert.equal(res.body[0].status, "PENDING");
      assert.equal(res.body[0].kidId, w.kidA.id);
    });

    test("400 non-uuid kid; 404 other family's kid (no leak); 401 without a parent token", async () => {
      const w = await world();
      await makeInvitation(w.kidB, { email: "other-family@test.local" });
      assert.equal((await api().get(`/api/parent-kids/abc/therapist-invitations`).set(bearer(w.a.token))).status, 400);
      const res = await api().get(`/api/parent-kids/${w.kidB.id}/therapist-invitations`).set(bearer(w.a.token));
      assert.equal(res.status, 404);
      assert.ok(!JSON.stringify(res.body).includes("other-family"));
      await expectParentAuthRequired("get", `/api/parent-kids/${w.kidA.id}/therapist-invitations`, w.staffToken);
    });
  });

  describe("POST /:kidId/therapist-invitations", () => {
    test("a brand-new email gets a retail-tenant invitation and an email with a working link", async () => {
      const w = await world();
      const disciplineIds = [randomUUID()];
      const res = await api()
        .post(`/api/parent-kids/${w.kidA.id}/therapist-invitations`)
        .set(bearer(w.a.token))
        .send({ email: "new.therapist@test.local", disciplineIds });
      assert.equal(res.status, 201);
      assert.equal(res.body.linked, false);
      const inv = res.body.invitation;
      assert.equal(inv.email, "new.therapist@test.local");
      assert.equal(inv.kidId, w.kidA.id);
      assert.equal(inv.tenantId, w.retail.id, "a parent-sent invite joins the retail tenant");
      assert.equal(inv.invitedByParentId, w.a.parent.id);
      assert.equal(inv.status, "PENDING");
      assert.deepEqual(inv.disciplineIds, disciplineIds);
      assert.ok(new Date(inv.expiresAt).getTime() > Date.now() + 13 * 86_400_000);

      // The link's token hashes to the stored tokenHash -- i.e. the emailed link is the real one.
      assert.match(res.body.inviteUrl, /\/invite\//);
      const row = await prisma.therapistInvitation.findUniqueOrThrow({ where: { id: inv.id } });
      assert.equal(row.tokenHash, hashToken(tokenFromUrl(res.body.inviteUrl)));

      assert.equal(testOutbox.length, 1);
      const mail = testOutbox[0];
      assert.equal(mail.to, "new.therapist@test.local");
      assert.equal(mail.subject, "You've been invited to join Alex Testchild's care team on Pravnya");
      assert.ok(mail.text.includes("Parent A invited you"), mail.text);
      assert.ok(mail.text.includes(w.retail.name), "email names the tenant the invitee will join");
      assert.ok(mail.text.includes(res.body.inviteUrl), "email contains the invite link");
      // No link was created yet -- that happens when the invite is accepted.
      assert.equal(await prisma.kidTherapist.count(), 0);
    });

    test("disciplineIds defaults to []", async () => {
      const w = await world();
      const res = await api()
        .post(`/api/parent-kids/${w.kidA.id}/therapist-invitations`)
        .set(bearer(w.a.token))
        .send({ email: "plain@test.local" });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body.invitation.disciplineIds, []);
    });

    test("an email that already belongs to a therapist (any tenant) links directly: no invitation, no email; idempotent", async () => {
      const w = await world();
      const otherTenant = await makeTenant();
      const { user, therapist } = await makeTherapist(otherTenant.id);
      for (let i = 0; i < 2; i++) {
        const res = await api()
          .post(`/api/parent-kids/${w.kidA.id}/therapist-invitations`)
          .set(bearer(w.a.token))
          .send({ email: user.email });
        assert.equal(res.status, 201);
        assert.equal(res.body.linked, true);
        assert.equal(res.body.therapist.id, therapist.id);
        assert.equal(res.body.therapist.user.email, user.email);
        assert.equal(res.body.therapist.tenant.id, otherTenant.id);
      }
      assert.equal(await prisma.kidTherapist.count({ where: { kidId: w.kidA.id, therapistId: therapist.id } }), 1);
      assert.equal(await prisma.therapistInvitation.count(), 0);
      assert.equal(testOutbox.length, 0);
    });

    test(
      "a therapist's email typed in different case still links directly instead of sending a new invite",
      { todo: "BUG: therapist lookup and assertEmailNotTaken match email case-sensitively" },
      async () => {
        const w = await world();
        const { user, therapist } = await makeTherapist(w.tenant.id);
        const res = await api()
          .post(`/api/parent-kids/${w.kidA.id}/therapist-invitations`)
          .set(bearer(w.a.token))
          .send({ email: user.email.toUpperCase() });
        assert.equal(res.body.linked, true, `got ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
        assert.equal(res.body.therapist.id, therapist.id);
      }
    );

    test("RETAIL_TENANT_ID not configured -> 500 RETAIL_TENANT_NOT_CONFIGURED for a new email; nothing written", async () => {
      const w = await world();
      const saved = env.RETAIL_TENANT_ID;
      env.RETAIL_TENANT_ID = undefined;
      try {
        const res = await api()
          .post(`/api/parent-kids/${w.kidA.id}/therapist-invitations`)
          .set(bearer(w.a.token))
          .send({ email: "new.therapist@test.local" });
        assert.equal(res.status, 500);
        assert.equal(res.body.error.code, "RETAIL_TENANT_NOT_CONFIGURED");
      } finally {
        env.RETAIL_TENANT_ID = saved;
      }
      assert.equal(await prisma.therapistInvitation.count(), 0);
      assert.equal(testOutbox.length, 0);
    });

    test("an email taken by a non-therapist user -> 409 EMAIL_TAKEN; nothing written, no email", async () => {
      const w = await world();
      const { user } = await makeUser("TENANT_ADMIN", w.tenant.id);
      const res = await api()
        .post(`/api/parent-kids/${w.kidA.id}/therapist-invitations`)
        .set(bearer(w.a.token))
        .send({ email: user.email });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "EMAIL_TAKEN");
      assert.equal(await prisma.therapistInvitation.count(), 0);
      assert.equal(await prisma.kidTherapist.count(), 0);
      assert.equal(testOutbox.length, 0);
    });

    for (const [name, body] of [
      ["missing email", {}],
      ["invalid email", { email: "not-an-email" }],
      ["non-uuid disciplineId", { email: "x@test.local", disciplineIds: ["slp"] }],
      ["disciplineIds not an array", { email: "x@test.local", disciplineIds: "slp" }]
    ] as const) {
      test(`400 for ${name}; nothing written`, async () => {
        const w = await world();
        const res = await api().post(`/api/parent-kids/${w.kidA.id}/therapist-invitations`).set(bearer(w.a.token)).send(body);
        assert.equal(res.status, 400);
        assert.equal(await prisma.therapistInvitation.count(), 0);
        assert.equal(testOutbox.length, 0);
      });
    }

    test("400 non-uuid kid; 404 other family's kid (nothing written, no email); 401 without a parent token", async () => {
      const w = await world();
      const body = { email: "someone@test.local" };
      assert.equal((await api().post(`/api/parent-kids/abc/therapist-invitations`).set(bearer(w.a.token)).send(body)).status, 400);
      assert.equal((await api().post(`/api/parent-kids/${w.kidB.id}/therapist-invitations`).set(bearer(w.a.token)).send(body)).status, 404);
      await expectParentAuthRequired("post", `/api/parent-kids/${w.kidA.id}/therapist-invitations`, w.staffToken, body);
      assert.equal(await prisma.therapistInvitation.count(), 0);
      assert.equal(testOutbox.length, 0);
    });

    test("an existing therapist's email on another family's kid -> 404 and no link created", async () => {
      const w = await world();
      const { user } = await makeTherapist(w.tenant.id);
      const res = await api().post(`/api/parent-kids/${w.kidB.id}/therapist-invitations`).set(bearer(w.a.token)).send({ email: user.email });
      assert.equal(res.status, 404);
      assert.equal(await prisma.kidTherapist.count(), 0);
    });
  });

  describe("DELETE /:kidId/therapist-invitations/:invitationId (revoke)", () => {
    test("revokes a pending invitation, admin-sent or parent-sent", async () => {
      const w = await world();
      const adminSent = await makeInvitation(w.kidA);
      const parentSent = await makeInvitation(w.kidA, { invitedByParentId: w.a.parent.id });
      for (const inv of [adminSent, parentSent]) {
        const res = await api().delete(`/api/parent-kids/${w.kidA.id}/therapist-invitations/${inv.id}`).set(bearer(w.a.token));
        assert.equal(res.status, 200);
        assert.equal(res.body.id, inv.id);
        assert.equal(res.body.status, "REVOKED");
        assert.equal((await prisma.therapistInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status, "REVOKED");
      }
    });

    for (const status of ["ACCEPTED", "REVOKED", "EXPIRED"] as const) {
      test(`a ${status} invitation can't be revoked -> 409, status unchanged`, async () => {
        const w = await world();
        const inv = await makeInvitation(w.kidA, { status });
        const res = await api().delete(`/api/parent-kids/${w.kidA.id}/therapist-invitations/${inv.id}`).set(bearer(w.a.token));
        assert.equal(res.status, 409);
        assert.equal((await prisma.therapistInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status, status);
      });
    }

    test("another family's invitation -> 404 under the parent's own kid or theirs; still PENDING", async () => {
      const w = await world();
      const foreign = await makeInvitation(w.kidB);
      const sibling = await makeInvitation(w.kidA2);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/therapist-invitations/${foreign.id}`).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidB.id}/therapist-invitations/${foreign.id}`).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/therapist-invitations/${sibling.id}`).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/therapist-invitations/${randomUUID()}`).set(bearer(w.a.token))).status, 404);
      assert.equal(await prisma.therapistInvitation.count({ where: { status: "PENDING" } }), 2);
    });

    test("400 non-uuid ids; 401 without a parent token (still PENDING)", async () => {
      const w = await world();
      const inv = await makeInvitation(w.kidA);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/therapist-invitations/nope`).set(bearer(w.a.token))).status, 400);
      assert.equal((await api().delete(`/api/parent-kids/nope/therapist-invitations/${inv.id}`).set(bearer(w.a.token))).status, 400);
      await expectParentAuthRequired("delete", `/api/parent-kids/${w.kidA.id}/therapist-invitations/${inv.id}`, w.staffToken);
      assert.equal((await prisma.therapistInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status, "PENDING");
    });
  });

  describe("POST /:kidId/therapist-invitations/:invitationId/resend", () => {
    test("pending: issues a fresh token and expiry and re-sends the email with the new link", async () => {
      const w = await world();
      const inv = await makeInvitation(w.kidA, { email: "resend@test.local" });
      await prisma.therapistInvitation.update({ where: { id: inv.id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });
      const res = await api().post(`/api/parent-kids/${w.kidA.id}/therapist-invitations/${inv.id}/resend`).set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.equal(res.body.invitation.id, inv.id);
      assert.equal(res.body.invitation.status, "PENDING");
      const row = await prisma.therapistInvitation.findUniqueOrThrow({ where: { id: inv.id } });
      assert.notEqual(row.tokenHash, inv.tokenHash, "old link must stop working");
      assert.equal(row.tokenHash, hashToken(tokenFromUrl(res.body.inviteUrl)));
      assert.ok(row.expiresAt.getTime() > Date.now() + 13 * 86_400_000);

      assert.equal(testOutbox.length, 1);
      assert.equal(testOutbox[0].to, "resend@test.local");
      assert.ok(testOutbox[0].subject.includes("Alex Testchild"));
      assert.ok(testOutbox[0].text.includes(res.body.inviteUrl));
      // Admin-sent invite: the email names the invitation's own tenant.
      assert.ok(testOutbox[0].text.includes("Bright Steps Clinic"));
    });

    test("an EXPIRED invitation is brought back to PENDING", async () => {
      const w = await world();
      const inv = await makeInvitation(w.kidA, { status: "EXPIRED" });
      const res = await api().post(`/api/parent-kids/${w.kidA.id}/therapist-invitations/${inv.id}/resend`).set(bearer(w.a.token));
      assert.equal(res.status, 200);
      assert.equal(res.body.invitation.status, "PENDING");
      assert.equal((await prisma.therapistInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status, "PENDING");
    });

    for (const status of ["ACCEPTED", "REVOKED"] as const) {
      test(`a ${status} invitation can't be resent -> 409; no email, token unchanged`, async () => {
        const w = await world();
        const inv = await makeInvitation(w.kidA, { status });
        const res = await api().post(`/api/parent-kids/${w.kidA.id}/therapist-invitations/${inv.id}/resend`).set(bearer(w.a.token));
        assert.equal(res.status, 409);
        const row = await prisma.therapistInvitation.findUniqueOrThrow({ where: { id: inv.id } });
        assert.equal(row.status, status);
        assert.equal(row.tokenHash, inv.tokenHash);
        assert.equal(testOutbox.length, 0);
      });
    }

    test("another family's invitation -> 404; no email, token unchanged", async () => {
      const w = await world();
      const foreign = await makeInvitation(w.kidB);
      const sibling = await makeInvitation(w.kidA2);
      for (const [kidId, invId] of [
        [w.kidA.id, foreign.id],
        [w.kidB.id, foreign.id],
        [w.kidA.id, sibling.id],
        [w.kidA.id, randomUUID()]
      ]) {
        const res = await api().post(`/api/parent-kids/${kidId}/therapist-invitations/${invId}/resend`).set(bearer(w.a.token));
        assert.equal(res.status, 404, `${kidId}/${invId}`);
      }
      assert.equal((await prisma.therapistInvitation.findUniqueOrThrow({ where: { id: foreign.id } })).tokenHash, foreign.tokenHash);
      assert.equal(testOutbox.length, 0);
    });

    test("400 non-uuid ids; 401 without a parent token (no email)", async () => {
      const w = await world();
      const inv = await makeInvitation(w.kidA);
      assert.equal((await api().post(`/api/parent-kids/${w.kidA.id}/therapist-invitations/nope/resend`).set(bearer(w.a.token))).status, 400);
      assert.equal((await api().post(`/api/parent-kids/nope/therapist-invitations/${inv.id}/resend`).set(bearer(w.a.token))).status, 400);
      await expectParentAuthRequired("post", `/api/parent-kids/${w.kidA.id}/therapist-invitations/${inv.id}/resend`, w.staffToken);
      assert.equal(testOutbox.length, 0);
    });
  });

  describe("DELETE /:kidId/therapists/:therapistId (unlink)", () => {
    test("204; removes only this kid's link, the therapist and their other links remain", async () => {
      const w = await world();
      const { therapist } = await makeTherapist(w.tenant.id);
      await linkTherapist(w.kidA.id, therapist.id);
      await linkTherapist(w.kidA2.id, therapist.id);
      const res = await api().delete(`/api/parent-kids/${w.kidA.id}/therapists/${therapist.id}`).set(bearer(w.a.token));
      assert.equal(res.status, 204);
      assert.equal(await prisma.kidTherapist.count({ where: { kidId: w.kidA.id } }), 0);
      assert.equal(await prisma.kidTherapist.count({ where: { kidId: w.kidA2.id } }), 1);
      assert.ok(await prisma.therapist.findUnique({ where: { id: therapist.id } }));
      // Unlinking again: not on the care team any more.
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/therapists/${therapist.id}`).set(bearer(w.a.token))).status, 404);
    });

    test("a therapist linked only to another family's kid -> 404, their link survives", async () => {
      const w = await world();
      const { therapist } = await makeTherapist(w.tenant.id);
      await linkTherapist(w.kidB.id, therapist.id);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/therapists/${therapist.id}`).set(bearer(w.a.token))).status, 404);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidB.id}/therapists/${therapist.id}`).set(bearer(w.a.token))).status, 404);
      assert.equal(await prisma.kidTherapist.count({ where: { kidId: w.kidB.id } }), 1);
    });

    test("400 non-uuid ids; 401 without a parent token (link survives)", async () => {
      const w = await world();
      const { therapist } = await makeTherapist(w.tenant.id);
      await linkTherapist(w.kidA.id, therapist.id);
      assert.equal((await api().delete(`/api/parent-kids/${w.kidA.id}/therapists/nope`).set(bearer(w.a.token))).status, 400);
      assert.equal((await api().delete(`/api/parent-kids/nope/therapists/${therapist.id}`).set(bearer(w.a.token))).status, 400);
      await expectParentAuthRequired("delete", `/api/parent-kids/${w.kidA.id}/therapists/${therapist.id}`, w.staffToken);
      assert.equal(await prisma.kidTherapist.count(), 1);
    });
  });
});
