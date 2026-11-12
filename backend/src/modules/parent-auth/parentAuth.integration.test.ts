import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../../config/prisma";
import { testOutbox } from "../therapist-invitations/invitationEmail.service";
import { makeTenant, makeUser } from "../../test/factories";
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
