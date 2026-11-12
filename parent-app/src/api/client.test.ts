import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, SCHEDULE_DAYS, SCHEDULE_LABELS } from "./client";

// request() is private, so it's exercised through the public api.* methods with fetch mocked --
// which is also exactly the contract the rest of the app depends on.

type FetchArgs = [string, RequestInit];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const lastCall = () => fetchMock.mock.calls.at(-1) as FetchArgs;

describe("request() -- URL, method, headers, body", () => {
  test("GET with a token sends a Bearer header and no body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "parent-1" }));
    await expect(api.me("tok-123")).resolves.toEqual({ id: "parent-1" });

    const [url, init] = lastCall();
    expect(url).toMatch(/\/api\/parent-auth\/me$/);
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer tok-123" });
    expect(init.body).toBeUndefined();
  });

  test("POST without a token has no Authorization header and a JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { token: "t", parent: {} }));
    await api.login("parent@test.local", "secret-pass");

    const [url, init] = lastCall();
    expect(url).toMatch(/\/api\/parent-auth\/login$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ email: "parent@test.local", password: "secret-pass" });
  });

  test("204 No Content resolves to undefined without parsing a body", async () => {
    const res = new Response(null, { status: 204 });
    const jsonSpy = vi.spyOn(res, "json");
    fetchMock.mockResolvedValue(res);
    await expect(api.unlinkTherapist("t", "kid-1", "th-1")).resolves.toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
    const [url, init] = lastCall();
    expect(url).toMatch(/\/api\/parent-kids\/kid-1\/therapists\/th-1$/);
    expect(init.method).toBe("DELETE");
  });

  test("a non-OK response throws ApiError carrying the server's message and status", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: { message: "That slot already exists", code: "CONFLICT" } }));
    const err = await api.createScheduleSlot("t", "kid-1", { label: "ABA", dayOfWeek: "Mon", startTime: "10:00" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.message).toBe("That slot already exists");
  });

  test("a non-OK response without the error shape falls back to a generic message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { oops: true }));
    const err = await api.me("t").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("Something went wrong");
  });

  test("a non-OK response with an unparseable body also falls back", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    const err = await api.me("t").catch((e) => e);
    expect(err).toMatchObject({ status: 502, message: "Something went wrong" });
  });

  test("an OK response with an unparseable body resolves to null rather than throwing", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));
    await expect(api.me("t")).resolves.toBeNull();
  });

  test("a network failure propagates as-is (not wrapped in ApiError)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api.me("t").catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(ApiError);
  });
});

describe("api.* endpoints -- path, method and body for each call", () => {
  const cases: { name: string; call: () => Promise<unknown>; path: string; method: string; body?: unknown; auth: boolean }[] = [
    { name: "sendVerificationCode", call: () => api.sendVerificationCode("a@test.local"), path: "/parent-auth/send-verification-code", method: "POST", body: { email: "a@test.local" }, auth: false },
    {
      name: "register",
      call: () => api.register({ email: "a@test.local", password: "pw123456", name: "A", verificationCode: "123456", consent: true }),
      path: "/parent-auth/register",
      method: "POST",
      body: { email: "a@test.local", password: "pw123456", name: "A", verificationCode: "123456", consent: true },
      auth: false
    },
    {
      name: "resetPassword",
      call: () => api.resetPassword({ email: "a@test.local", verificationCode: "123456", newPassword: "newpass99" }),
      path: "/parent-auth/reset-password",
      method: "POST",
      body: { email: "a@test.local", verificationCode: "123456", newPassword: "newpass99" },
      auth: false
    },
    { name: "createFirstKid", call: () => api.createFirstKid("t", { name: "Sam", dob: "2020-01-01" }), path: "/parent-kids", method: "POST", body: { name: "Sam", dob: "2020-01-01" }, auth: true },
    { name: "updateKid", call: () => api.updateKid("t", "k1", { gender: "Female" }), path: "/parent-kids/k1", method: "PATCH", body: { gender: "Female" }, auth: true },
    {
      name: "extractIep",
      call: () => api.extractIep("t", "k1", { kind: "pdf", base64: "AAA" }),
      path: "/parent-kids/k1/iep/extract",
      method: "POST",
      body: { source: { kind: "pdf", base64: "AAA" } },
      auth: true
    },
    { name: "acceptIepGoals", call: () => api.acceptIepGoals("t", "k1", []), path: "/parent-kids/k1/iep/accept-goals", method: "POST", body: { candidates: [] }, auth: true },
    { name: "listGoals", call: () => api.listGoals("t", "k1"), path: "/parent-kids/k1/goals", method: "GET", auth: true },
    { name: "listCentres", call: () => api.listCentres("t"), path: "/parent-centres", method: "GET", auth: true },
    { name: "createCentre", call: () => api.createCentre("t", { name: "New Place" }), path: "/parent-centres", method: "POST", body: { name: "New Place" }, auth: true },
    {
      name: "logEvidence",
      call: () => api.logEvidence("t", "k1", "g1", { logDate: "2026-11-01", outcome: "CORRECT", supportLevel: "INDEPENDENT", modality: "VERBAL" }),
      path: "/parent-kids/k1/goals/g1/evidence",
      method: "POST",
      body: { logDate: "2026-11-01", outcome: "CORRECT", supportLevel: "INDEPENDENT", modality: "VERBAL" },
      auth: true
    },
    { name: "extractEvidence", call: () => api.extractEvidence("t", "k1", { freeText: "hi" }), path: "/parent-kids/k1/goals/extract-evidence", method: "POST", body: { freeText: "hi" }, auth: true },
    { name: "listCompanionMessages", call: () => api.listCompanionMessages("t", "k1"), path: "/parent-kids/k1/companion/messages", method: "GET", auth: true },
    { name: "sendCompanionMessage", call: () => api.sendCompanionMessage("t", "k1", "hello"), path: "/parent-kids/k1/companion/messages", method: "POST", body: { text: "hello" }, auth: true },
    { name: "listTherapists", call: () => api.listTherapists("t", "k1"), path: "/parent-kids/k1/therapists", method: "GET", auth: true },
    { name: "listTherapistInvitations", call: () => api.listTherapistInvitations("t", "k1"), path: "/parent-kids/k1/therapist-invitations", method: "GET", auth: true },
    { name: "inviteTherapist", call: () => api.inviteTherapist("t", "k1", "x@test.local"), path: "/parent-kids/k1/therapist-invitations", method: "POST", body: { email: "x@test.local" }, auth: true },
    { name: "revokeTherapistInvitation", call: () => api.revokeTherapistInvitation("t", "k1", "i1"), path: "/parent-kids/k1/therapist-invitations/i1", method: "DELETE", auth: true },
    { name: "resendTherapistInvitation", call: () => api.resendTherapistInvitation("t", "k1", "i1"), path: "/parent-kids/k1/therapist-invitations/i1/resend", method: "POST", auth: true },
    { name: "listSchedule", call: () => api.listSchedule("t", "k1"), path: "/parent-kids/k1/schedule", method: "GET", auth: true },
    {
      name: "updateScheduleSlot",
      call: () => api.updateScheduleSlot("t", "k1", "s1", { label: "ABA", dayOfWeek: "Fri", startTime: "09:30" }),
      path: "/parent-kids/k1/schedule/s1",
      method: "PATCH",
      body: { label: "ABA", dayOfWeek: "Fri", startTime: "09:30" },
      auth: true
    },
    { name: "deleteScheduleSlot", call: () => api.deleteScheduleSlot("t", "k1", "s1"), path: "/parent-kids/k1/schedule/s1", method: "DELETE", auth: true }
  ];

  for (const c of cases) {
    test(c.name, async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await c.call();
      const [url, init] = lastCall();
      expect(url.endsWith(`/api${c.path}`)).toBe(true);
      expect(init.method).toBe(c.method);
      expect(init.body === undefined ? undefined : JSON.parse(init.body as string)).toEqual(c.body);
      expect((init.headers as Record<string, string>).Authorization).toBe(c.auth ? "Bearer t" : undefined);
    });
  }
});

describe("API base URL", () => {
  test("uses VITE_API_BASE_URL when set", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
    vi.resetModules();
    const fresh = await import("./client");
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    await fresh.api.listCentres("t");
    expect(lastCall()[0]).toBe("https://api.example.test/api/parent-centres");
  });

  test("falls back to the local dev backend in dev mode", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    vi.stubEnv("DEV", true);
    vi.resetModules();
    const fresh = await import("./client");
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    await fresh.api.listCentres("t");
    expect(lastCall()[0]).toBe("http://localhost:4011/api/parent-centres");
  });

  test("is same-origin (relative) in a production build without an override", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    vi.stubEnv("DEV", false);
    vi.resetModules();
    const fresh = await import("./client");
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    await fresh.api.listCentres("t");
    expect(lastCall()[0]).toBe("/api/parent-centres");
  });
});

test("schedule constants match the onboarding option lists", () => {
  expect(SCHEDULE_DAYS).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  expect(SCHEDULE_LABELS).toEqual(["Speech therapy", "ABA", "Occupational therapy", "Physiotherapy", "Special education", "Other"]);
});
