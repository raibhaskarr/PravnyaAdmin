import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { blockViewer, requireAuth, requireRole, requireTenantScope, signToken } from "./auth";

function fakeReq(overrides: Partial<Request> = {}) {
  return { headers: {}, ...overrides } as Request;
}

function expectThrows(fn: () => void, status: number) {
  try {
    fn();
    assert.fail("expected to throw");
  } catch (err) {
    assert.ok(err instanceof AppError);
    assert.equal(err.status, status);
  }
}

test("requireAuth rejects a missing Authorization header", () => {
  expectThrows(() => requireAuth(fakeReq(), {} as Response, () => {}), 401);
});

test("requireAuth rejects a malformed token", () => {
  const req = fakeReq({ headers: { authorization: "Bearer not-a-real-token" } });
  expectThrows(() => requireAuth(req, {} as Response, () => {}), 401);
});

test("requireAuth accepts a validly signed token and attaches req.user", () => {
  const token = signToken({ id: "user-1", role: "TENANT_ADMIN", tenantId: "tenant-1" });
  const req = fakeReq({ headers: { authorization: `Bearer ${token}` } });
  let nextCalled = false;
  requireAuth(req, {} as Response, () => {
    nextCalled = true;
  });
  assert.ok(nextCalled);
  assert.deepEqual(req.user, { id: "user-1", role: "TENANT_ADMIN", tenantId: "tenant-1" });
});

test("requireRole rejects a user without an allowed role", () => {
  const req = fakeReq({ user: { id: "u1", role: "THERAPIST", tenantId: "t1" } });
  expectThrows(() => requireRole("SUPERADMIN")(req, {} as Response, () => {}), 403);
});

test("requireRole allows a user with an allowed role", () => {
  const req = fakeReq({ user: { id: "u1", role: "SUPERADMIN", tenantId: null } });
  let nextCalled = false;
  requireRole("SUPERADMIN")(req, {} as Response, () => {
    nextCalled = true;
  });
  assert.ok(nextCalled);
});

test("requireTenantScope rejects a superadmin (no tenant)", () => {
  const req = fakeReq({ user: { id: "u1", role: "SUPERADMIN", tenantId: null } });
  expectThrows(() => requireTenantScope(req, {} as Response, () => {}), 403);
});

test("requireTenantScope allows any tenant-scoped role", () => {
  const req = fakeReq({ user: { id: "u1", role: "VIEWER", tenantId: "t1" } });
  let nextCalled = false;
  requireTenantScope(req, {} as Response, () => {
    nextCalled = true;
  });
  assert.ok(nextCalled);
});

test("blockViewer rejects the VIEWER role", () => {
  const req = fakeReq({ user: { id: "u1", role: "VIEWER", tenantId: "t1" } });
  expectThrows(() => blockViewer(req, {} as Response, () => {}), 403);
});

test("blockViewer allows TENANT_ADMIN and THERAPIST", () => {
  for (const role of ["TENANT_ADMIN", "THERAPIST"] as const) {
    const req = fakeReq({ user: { id: "u1", role, tenantId: "t1" } });
    let nextCalled = false;
    blockViewer(req, {} as Response, () => {
      nextCalled = true;
    });
    assert.ok(nextCalled, `expected ${role} to pass`);
  }
});
