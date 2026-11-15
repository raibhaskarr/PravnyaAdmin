import { expect, test } from "@playwright/test";
import { DEMO_PARENT } from "../../support/env";
import { createFamily, scriptAi, signIn, openTab } from "../../support/api";

test.describe("Home", () => {
  test("nudges ask the missing onboarding questions one at a time, and save the answers", async ({ page, request }) => {
    const family = await createFamily(request, { therapies: [], scheduleDays: [], gender: null });
    const kid = family.kidNames[0];
    await signIn(page, family.email, family.password, kid);

    await expect(page.getByText(`What kind of support does ${kid} get right now?`)).toBeVisible();
    await page.getByRole("button", { name: "ABA", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText(`Which days does ${kid} usually have therapy?`)).toBeVisible();
    await page.getByRole("button", { name: "Wed", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText(`What's ${kid}'s gender?`)).toBeVisible();
    await page.getByRole("button", { name: "Prefer not to say" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(`What's ${kid}'s gender?`)).toHaveCount(0);

    // Answers were saved to the server, not just hidden: a reload asks nothing again.
    await page.reload();
    await expect(page.getByText(kid, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/What kind of support|Which days does|gender\?/)).toHaveCount(0);
  });

  test("'Not now' hides a nudge for this session", async ({ page, request }) => {
    const family = await createFamily(request, { therapies: [] });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await expect(page.getByText(/What kind of support does/)).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByText(/What kind of support does/)).toHaveCount(0);
  });

  test("a new milestone opens Home, and 'See Growth' goes to the Growth tab", async ({ page }) => {
    await signIn(page, DEMO_PARENT.email, DEMO_PARENT.password, DEMO_PARENT.kidName);
    await expect(page.getByText(/nice work!/)).toBeVisible();
    await page.getByRole("button", { name: "See Growth" }).click();
    await expect(page.getByText("Growth highlight", { exact: false })).toBeVisible();
  });

  test("after a scheduled session, Home offers to log it", async ({ page, request }) => {
    const now = new Date();
    test.skip(now.getHours() < 1, "needs a session at least 45 minutes before now, today");
    const family = await createFamily(request);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
    const started = new Date(now.getTime() - 60 * 60_000);
    const startTime = `${String(started.getHours()).padStart(2, "0")}:${String(started.getMinutes()).padStart(2, "0")}`;
    const res = await request.post(`http://localhost:4111/api/parent-kids/${family.kidIds[0]}/schedule`, {
      headers: { Authorization: `Bearer ${family.token}` },
      data: { label: "Occupational therapy", dayOfWeek: day, startTime }
    });
    expect(res.status()).toBe(201);

    await signIn(page, family.email, family.password, family.kidNames[0]);
    await expect(page.getByText(/had Occupational therapy today/)).toBeVisible();
    await page.getByRole("button", { name: "Log it" }).click();
    await expect(page.locator("header p", { hasText: /^Log$/ })).toBeVisible();
    await expect(page.locator("textarea")).toHaveValue(/Occupational therapy today/);
  });

  test("asking Pravnya a question shows the answer, and the conversation is kept", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await scriptAi(request, "companion-message", { intent: "question", reply: "Try short, playful practice -- five minutes after snack time works well." });

    await page.getByPlaceholder(/Ask a question/).fill("How can I practise at home?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("How can I practise at home?")).toBeVisible();
    await expect(page.getByText(/five minutes after snack time/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/five minutes after snack time/)).toBeVisible();
  });

  test("telling Pravnya what happened opens Log a session with that text", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await scriptAi(request, "companion-message", { intent: "log" });
    await page.getByPlaceholder(/Ask a question/).fill("He asked for juice using two words today");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("header p", { hasText: /^Log$/ })).toBeVisible();
    await expect(page.locator("textarea")).toHaveValue("He asked for juice using two words today");
  });

  test("if the AI is unavailable, Pravnya says so instead of failing", async ({ page, request }) => {
    const family = await createFamily(request);
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await scriptAi(request, "companion-message", "not json at all");
    await page.getByPlaceholder(/Ask a question/).fill("Anything?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/couldn't think that through/i)).toBeVisible();
  });

  test("feed cards link to Growth and Activities", async ({ page }) => {
    await signIn(page, DEMO_PARENT.email, DEMO_PARENT.password, DEMO_PARENT.kidName);
    const card = page.locator("main button").filter({ hasText: /Growth highlight|Try this at home/i }).first();
    await card.scrollIntoViewIfNeeded();
    const isGrowth = /Growth highlight/i.test(await card.innerText());
    await card.click();
    await expect(page.locator("header p", { hasText: isGrowth ? "Growth" : "Activities" })).toBeVisible();
    await openTab(page, "Home");
  });
});
