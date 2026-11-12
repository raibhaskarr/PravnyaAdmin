import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { testOutbox } from "../therapist-invitations/invitationEmail.service";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { signParentToken } from "../../common/middleware/parentAuth";
import { makeKid, makeParent, makeTenant, makeUser, TEST_PASSWORD } from "../../test/factories";
import { disconnectDb, resetDb } from "../../test/db";
import { api, bearer } from "../../test/http";

const EMAIL = "new.parent@test.local";
const PASSWORD = "Strong-pass-123";

async function requestCode(email = EMAIL) {
  const res = await api().post("/api/parent-auth/send-verification-code").send({ email });
  assert.equal(res.status, 200);
  const mail = testOutbox.filter((m) => m.to === email).at(-1);
  assert.ok(mail, "verification email should be captured in the test outbox");
  const code = mail.text.match(/\b(\d{6})\b/)?.[1];
  assert.ok(code, "email should contain a 6-digit code");
  return code;
}

function register(code: string, overrides: Record<string, unknown> = {}) {
  return api()
    .post("/api/parent-auth/register")
    .send({ email: EMAIL, password: PASSWORD, name: "New Parent", verificationCode: code, consent: true, ...overrides });
}

describe("parent sign-up, login and password reset", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("full sign-up: code by email -> register -> login -> /me", async () => {
    const code = await requestCode();
    const reg = await register(code);
    assert.equal(reg.status, 201);
    assert.ok(reg.body.token);

    const login = await api().post("/api/parent-auth/login").send({ email: EMAIL, password: PASSWORD });
    assert.equal(login.status, 200);

    const me = await api().get("/api/parent-auth/me").set(bearer(login.body.token));
    assert.equal(me.status, 200);
    assert.equal(me.body.email, EMAIL);
    assert.equal(me.body.name, "New Parent");
  });

  test("email is matched case-insensitively", async () => {
    const code = await requestCode();
    assert.equal((await register(code)).status, 201);
    const login = await api().post("/api/parent-auth/login").send({ email: EMAIL.toUpperCase(), password: PASSWORD });
    assert.equal(login.status, 200);
  });

  test("a wrong code is rejected", async () => {
    const code = await requestCode();
    const wrong = code === "000000" ? "111111" : "000000";
    const res = await register(wrong);
    assert.equal(res.status, 400);
    assert.equal(await prisma.parent.count(), 0);
  });

  test("a code can only be used once", async () => {
    const code = await requestCode();
    assert.equal((await register(code)).status, 201);
    const again = await register(code);
    assert.ok(again.status === 400 || again.status === 409, `expected 400/409, got ${again.status}`);
  });

  test("an expired code is rejected", async () => {
    const code = await requestCode();
    await prisma.parentVerificationCode.update({ where: { email: EMAIL }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await register(code);
    assert.equal(res.status, 400);
  });

  test("requesting a new code invalidates the previous one", async () => {
    const first = await requestCode();
    const second = await requestCode();
    if (first !== second) assert.equal((await register(first)).status, 400);
    assert.equal((await register(second)).status, 201);
  });

  test("consent is required", async () => {
    const code = await requestCode();
    const res = await register(code, { consent: false });
    assert.equal(res.status, 400);
  });

  test("registering an already-registered email is refused", async () => {
    assert.equal((await register(await requestCode())).status, 201);
    const res = await register(await requestCode(), { password: "Another-pass-456" });
    assert.equal(res.status, 409);
    // and the original password still works -- register must never reset it
    const login = await api().post("/api/parent-auth/login").send({ email: EMAIL, password: PASSWORD });
    assert.equal(login.status, 200);
  });

  test("login with a wrong password or unknown email gives the same generic 401", async () => {
    assert.equal((await register(await requestCode())).status, 201);
    const wrongPw = await api().post("/api/parent-auth/login").send({ email: EMAIL, password: "nope-nope-nope" });
    const unknown = await api().post("/api/parent-auth/login").send({ email: "nobody@test.local", password: PASSWORD });
    assert.equal(wrongPw.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrongPw.body.error.message, unknown.body.error.message);
  });

  test("reset password: old password stops working, new one works", async () => {
    assert.equal((await register(await requestCode())).status, 201);
    const code = await requestCode();
    const reset = await api()
      .post("/api/parent-auth/reset-password")
      .send({ email: EMAIL, verificationCode: code, newPassword: "Brand-new-pass-789" });
    assert.equal(reset.status, 200);
    assert.equal((await api().post("/api/parent-auth/login").send({ email: EMAIL, password: PASSWORD })).status, 401);
    assert.equal((await api().post("/api/parent-auth/login").send({ email: EMAIL, password: "Brand-new-pass-789" })).status, 200);
  });

  test("/me rejects no token, a garbage token, and a staff token", async () => {
    assert.equal((await api().get("/api/parent-auth/me")).status, 401);
    assert.equal((await api().get("/api/parent-auth/me").set(bearer("garbage"))).status, 401);
    const tenant = await makeTenant();
    const { token: staffToken } = await makeUser("TENANT_ADMIN", tenant.id);
    assert.equal((await api().get("/api/parent-auth/me").set(bearer(staffToken))).status, 401);
  });
});

// Gaps not covered above: request validation, the "claim a staff-created parent record" register
// branch, reset/login edge cases, the /me response shape and token edge cases.
describe("parent auth: validation and edge cases", () => {
  beforeEach(resetDb);
  after(disconnectDb);

  test("send-verification-code: 400 for a missing/invalid email, nothing sent; email is lower-cased", async () => {
    assert.equal((await api().post("/api/parent-auth/send-verification-code").send({})).status, 400);
    assert.equal((await api().post("/api/parent-auth/send-verification-code").send({ email: "nope" })).status, 400);
    assert.equal(testOutbox.length, 0);
    const res = await api().post("/api/parent-auth/send-verification-code").send({ email: "Mixed.Case@Test.Local" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { sent: true });
    assert.equal(testOutbox[0].to, "mixed.case@test.local");
    assert.ok(await prisma.parentVerificationCode.findUnique({ where: { email: "mixed.case@test.local" } }));
  });

  test("register: response shape; 400 for short password, missing name, malformed code; nothing created", async () => {
    const code = await requestCode();
    for (const overrides of [{ password: "short" }, { name: "" }, { verificationCode: "123" }, { email: "not-an-email" }]) {
      const res = await register(code, overrides);
      assert.equal(res.status, 400, JSON.stringify(overrides));
    }
    assert.equal(await prisma.parent.count(), 0);
    const ok = await register(code);
    assert.equal(ok.status, 201);
    assert.deepEqual(Object.keys(ok.body).sort(), ["parent", "token"]);
    assert.deepEqual(Object.keys(ok.body.parent).sort(), ["email", "id", "name"]);
    assert.equal(ok.body.parent.name, "New Parent");
    assert.ok(!JSON.stringify(ok.body).includes("passwordHash"));
  });

  test("register without ever requesting a code -> 400", async () => {
    const res = await register("123456");
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_CODE");
  });

  test("register claims a staff-created parent record (no password yet) and keeps its kids", async () => {
    const tenant = await makeTenant();
    const existing = await prisma.parent.create({ data: { email: EMAIL } });
    const kid = await makeKid(tenant.id, existing.id, { firstName: "Alex" });
    const res = await register(await requestCode());
    assert.equal(res.status, 201);
    assert.equal(res.body.parent.id, existing.id);
    assert.equal(await prisma.parent.count(), 1);
    const row = await prisma.parent.findUniqueOrThrow({ where: { id: existing.id } });
    assert.ok(row.emailVerifiedAt);
    assert.equal(row.displayName, "New Parent");
    const me = await api().get("/api/parent-auth/me").set(bearer(res.body.token));
    assert.deepEqual(me.body.kids.map((k: { id: string }) => k.id), [kid.id]);
  });

  test("login: a staff-created parent with no password gets the generic 401; 400 for a malformed body", async () => {
    await prisma.parent.create({ data: { email: EMAIL } });
    const res = await api().post("/api/parent-auth/login").send({ email: EMAIL, password: PASSWORD });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
    assert.equal((await api().post("/api/parent-auth/login").send({ email: EMAIL })).status, 400);
    assert.equal((await api().post("/api/parent-auth/login").send({ email: "nope", password: "x" })).status, 400);
    assert.equal((await api().post("/api/parent-auth/login").send({ email: EMAIL, password: "" })).status, 400);
  });

  test("login response shape", async () => {
    const { parent } = await makeParent({ name: "Shape Parent" });
    const res = await api().post("/api/parent-auth/login").send({ email: parent.email, password: TEST_PASSWORD });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.parent, { id: parent.id, email: parent.email, name: "Shape Parent" });
    assert.ok(res.body.token);
  });

  test("reset-password: no account / passwordless account -> 404 NO_ACCOUNT", async () => {
    const res = await api()
      .post("/api/parent-auth/reset-password")
      .send({ email: EMAIL, verificationCode: await requestCode(), newPassword: "Brand-new-pass-789" });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NO_ACCOUNT");
    await prisma.parent.create({ data: { email: EMAIL } });
    const passwordless = await api()
      .post("/api/parent-auth/reset-password")
      .send({ email: EMAIL, verificationCode: await requestCode(), newPassword: "Brand-new-pass-789" });
    assert.equal(passwordless.status, 404);
    assert.equal((await prisma.parent.findUniqueOrThrow({ where: { email: EMAIL } })).passwordHash, null);
  });

  test("reset-password: wrong code -> 400 and the password is unchanged; malformed body -> 400", async () => {
    assert.equal((await register(await requestCode())).status, 201);
    const code = await requestCode();
    const wrong = code === "000000" ? "111111" : "000000";
    const res = await api().post("/api/parent-auth/reset-password").send({ email: EMAIL, verificationCode: wrong, newPassword: "Brand-new-pass-789" });
    assert.equal(res.status, 400);
    assert.equal((await api().post("/api/parent-auth/login").send({ email: EMAIL, password: PASSWORD })).status, 200);
    const short = await api().post("/api/parent-auth/reset-password").send({ email: EMAIL, verificationCode: code, newPassword: "short" });
    assert.equal(short.status, 400);
  });

  test("reset-password returns a working token and the parent's public shape", async () => {
    assert.equal((await register(await requestCode())).status, 201);
    const res = await api()
      .post("/api/parent-auth/reset-password")
      .send({ email: EMAIL.toUpperCase(), verificationCode: await requestCode(), newPassword: "Brand-new-pass-789" });
    assert.equal(res.status, 200);
    assert.equal(res.body.parent.email, EMAIL);
    assert.equal((await api().get("/api/parent-auth/me").set(bearer(res.body.token))).status, 200);
  });

  test("/me returns id/email/name and each kid's onboarding fields", async () => {
    const tenant = await makeTenant();
    const { parent, token } = await makeParent({ name: "Me Parent" });
    const kid = await makeKid(tenant.id, parent.id, { firstName: "Alex" });
    await prisma.kid.update({ where: { id: kid.id }, data: { selfReportedTherapies: ["ABA"], selfReportedScheduleDays: ["Mon"] } });
    const res = await api().get("/api/parent-auth/me").set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.id, parent.id);
    assert.equal(res.body.name, "Me Parent");
    assert.equal(res.body.passwordHash, undefined);
    assert.deepEqual(Object.keys(res.body.kids[0]).sort(), [
      "dob",
      "firstName",
      "gender",
      "id",
      "lastName",
      "selfReportedScheduleDays",
      "selfReportedTherapies"
    ]);
    assert.deepEqual(res.body.kids[0].selfReportedTherapies, ["ABA"]);
  });

  test("/me rejects an expired parent token and one signed with the wrong secret", async () => {
    const { parent } = await makeParent();
    const expired = jwt.sign({ id: parent.id, kind: "parent", exp: Math.floor(Date.now() / 1000) - 60 }, env.JWT_SECRET);
    assert.equal((await api().get("/api/parent-auth/me").set(bearer(expired))).status, 401);
    const forged = jwt.sign({ id: parent.id, kind: "parent" }, "some-other-secret-that-is-long-enough");
    assert.equal((await api().get("/api/parent-auth/me").set(bearer(forged))).status, 401);
    const noId = jwt.sign({ kind: "parent" }, env.JWT_SECRET);
    assert.equal((await api().get("/api/parent-auth/me").set(bearer(noId))).status, 401);
    assert.equal((await api().get("/api/parent-auth/me").set({ Authorization: signParentToken(parent.id) })).status, 401, "missing Bearer prefix");
  });

  test(
    "/me with a valid token for a parent that no longer exists -> 401/404, not 500",
    { todo: "BUG: me() uses findUniqueOrThrow; the Prisma NotFoundError surfaces as a 500" },
    async () => {
      const res = await api().get("/api/parent-auth/me").set(bearer(signParentToken("00000000-0000-4000-8000-0000000000ff")));
      assert.ok(res.status === 401 || res.status === 404, `got ${res.status} ${JSON.stringify(res.body)}`);
    }
  );
});
