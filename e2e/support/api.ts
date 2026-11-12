import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { BACKEND_URL, DEMO_PARENT } from "./env";
import { verificationCodeFor } from "./outbox";

// Helpers that set up state through the real backend API, so each test that changes data gets its
// own fresh family and never disturbs another test or the shared demo family.

export const PASSWORD = "E2e-strong-pass-1";
const api = (path: string) => `${BACKEND_URL}/api${path}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let counter = 0;
export const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${counter++}@test.local`;

/** Scripts what the fake AI answers for a feature ("companion-message", "extract-evidence-from-note", "extract-iep-goals"). */
export async function scriptAi(request: APIRequestContext, featureId: string, response: unknown) {
  const res = await request.post(api("/__test__/ai-responses"), { data: { featureId, response } });
  expect(res.status()).toBe(204);
}

export async function clearAi(request: APIRequestContext) {
  await request.delete(api("/__test__/ai-responses"));
}

export async function loginParent(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(api("/parent-auth/login"), { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token as string;
}

type ApiGoal = { id: string; title: string; canonicalSkill: { id: string; name: string }; items: { id: string; evidence: { id: string }[] }[] };

export async function listGoals(request: APIRequestContext, token: string, kidId: string): Promise<ApiGoal[]> {
  const res = await request.get(api(`/parent-kids/${kidId}/goals`), { headers: auth(token) });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** Canonical skill ids taken from the seeded demo family's goals -- valid inputs for scripted IEP answers. */
export async function demoSkillIds(request: APIRequestContext): Promise<string[]> {
  const token = await loginParent(request, DEMO_PARENT.email, DEMO_PARENT.password);
  const me = await (await request.get(api("/parent-auth/me"), { headers: auth(token) })).json();
  const goals = await listGoals(request, token, me.kids[0].id);
  return goals.map((g) => g.canonicalSkill.id);
}

export type Family = { email: string; password: string; token: string; kidIds: string[]; kidNames: string[] };

/**
 * A brand-new parent, registered the real way (verification code from the test outbox), with one
 * or more children. `goals` adds that many goals to the first child through the real IEP
 * extract + accept endpoints, with the AI scripted.
 */
export async function createFamily(
  request: APIRequestContext,
  opts: { name?: string; kids?: string[]; goals?: number; therapies?: string[]; scheduleDays?: string[]; gender?: string | null } = {}
): Promise<Family> {
  const email = uniqueEmail("family");
  await request.post(api("/parent-auth/send-verification-code"), { data: { email } });
  const code = await verificationCodeFor(request, email);
  const reg = await request.post(api("/parent-auth/register"), {
    data: { email, password: PASSWORD, name: opts.name ?? "E2E Parent", verificationCode: code, consent: true }
  });
  expect(reg.status()).toBe(201);
  const token = (await reg.json()).token as string;

  const kidNames = opts.kids ?? ["Kabir"];
  const kidIds: string[] = [];
  for (const name of kidNames) {
    const res = await request.post(api("/parent-kids"), { headers: auth(token), data: { name: `${name} Test`, dob: "2021-03-09T00:00:00.000Z" } });
    expect(res.status()).toBe(201);
    const kid = await res.json();
    kidIds.push(kid.id);
    // Answer the onboarding questions (therapies, days, gender) unless a test passes empty values
    // to make the matching Home nudge show.
    const patch: Record<string, unknown> = {};
    const therapies = opts.therapies ?? ["Speech therapy"];
    const days = opts.scheduleDays ?? ["Mon"];
    const gender = opts.gender === undefined ? "Male" : opts.gender;
    if (therapies.length) patch.selfReportedTherapies = therapies;
    if (days.length) patch.selfReportedScheduleDays = days;
    if (gender) patch.gender = gender;
    if (Object.keys(patch).length) {
      const res = await request.patch(api(`/parent-kids/${kid.id}`), { headers: auth(token), data: patch });
      expect(res.ok()).toBeTruthy();
    }
  }

  if (opts.goals) await addGoalsViaIep(request, token, kidIds[0], opts.goals);
  return { email, password: PASSWORD, token, kidIds, kidNames };
}

export async function addGoalsViaIep(request: APIRequestContext, token: string, kidId: string, count: number) {
  const skills = (await demoSkillIds(request)).slice(0, count);
  await scriptAi(request, "extract-iep-goals", {
    newGoals: skills.map((canonicalSkillId, i) => ({
      canonicalSkillId,
      title: `E2E goal ${i + 1}`,
      confidence: 0.9,
      sourceExcerpt: `Goal ${i + 1} from the IEP`
    })),
    statusUpdates: []
  });
  const extract = await request.post(api(`/parent-kids/${kidId}/iep/extract`), {
    headers: auth(token),
    data: { source: { kind: "image", base64: PNG_BASE64, mimeType: "image/png" } }
  });
  expect(extract.ok()).toBeTruthy();
  const { newGoals } = await extract.json();
  const accept = await request.post(api(`/parent-kids/${kidId}/iep/accept-goals`), { headers: auth(token), data: { candidates: newGoals } });
  expect(accept.ok()).toBeTruthy();
  await clearAi(request);
  return listGoals(request, token, kidId);
}

/** Signs in through the real UI and waits for Home. */
export async function signIn(page: Page, email: string, password: string, kidName?: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (kidName) await expect(page.getByText(kidName, { exact: true }).first()).toBeVisible();
  else await expect(tabBar(page)).toBeVisible();
}

/** The visible tab navigation (bottom bar on a phone, left rail on a wide screen). */
export const tabBar = (page: Page) => page.getByRole("navigation").filter({ visible: true }).last();

export async function openTab(page: Page, tab: "Home" | "Growth" | "Activities" | "Goals" | "Profile") {
  await tabBar(page).getByRole("button", { name: new RegExp(tab) }).click();
  await expect(tabBar(page).getByRole("button", { name: new RegExp(tab) })).toHaveAttribute("aria-current", "page");
}

// A real 1x1 PNG. Images go straight to the (scripted) AI; a PDF would first need real text in it.
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** A tiny file the browser can "upload" -- what the AI "reads" from it is scripted per test. */
export const FAKE_SCAN = { name: "iep-scan.png", mimeType: "image/png", buffer: Buffer.from(PNG_BASE64, "base64") };

export async function createCentre(request: APIRequestContext, token: string, name: string) {
  const res = await request.post(api("/parent-centres"), { headers: auth(token), data: { name, city: "Pune" } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { id: string; name: string };
}

/** Logs one evidence entry on a goal (at a centre when centreId is given, else at home). */
export async function logEvidence(
  request: APIRequestContext,
  token: string,
  kidId: string,
  goalId: string,
  opts: { item?: string; centreId?: string | null; daysAgo?: number; outcome?: string; supportLevel?: string } = {}
) {
  const res = await request.post(api(`/parent-kids/${kidId}/goals/${goalId}/evidence`), {
    headers: auth(token),
    data: {
      newItemCustomText: opts.item ?? "Ball",
      logDate: new Date(Date.now() - (opts.daysAgo ?? 1) * 86_400_000).toISOString(),
      centreId: opts.centreId ?? null,
      outcome: opts.outcome ?? "CORRECT",
      supportLevel: opts.supportLevel ?? "INDEPENDENT",
      modality: "VERBAL"
    }
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

export async function addScheduleSlot(request: APIRequestContext, token: string, kidId: string, slot: { label: string; dayOfWeek: string; startTime: string }) {
  const res = await request.post(api(`/parent-kids/${kidId}/schedule`), { headers: auth(token), data: slot });
  expect(res.status()).toBe(201);
  return res.json();
}
