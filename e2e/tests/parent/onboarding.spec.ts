import { expect, test } from "@playwright/test";
import { verificationCodeFor } from "../../support/outbox";
import { FAKE_SCAN, PASSWORD, demoSkillIds, openTab, scriptAi, uniqueEmail } from "../../support/api";

async function startOnboarding(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, childName: string) {
  const email = uniqueEmail("onboard");
  const cont = page.getByRole("button", { name: "Continue", exact: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.getByLabel("Your name").fill("Onboarding Parent");
  await page.locator("button[type=submit]").click();
  await page.getByLabel("Confirm parent or guardian consent").check();
  await cont.click();
  await page.getByLabel("Verification code").fill(await verificationCodeFor(request, email));
  await cont.click();
  await page.getByLabel("Child's name").fill(childName);
  await cont.click();
  await page.getByLabel("Date of birth").fill("2020-11-02");
  await cont.click();
  return { email, cont };
}

test("onboarding with every optional answer filled in -- Home then asks nothing more", async ({ page, request }) => {
  const { cont } = await startOnboarding(page, request, "Anaya");

  await expect(page.getByText("What's Anaya's gender?")).toBeVisible();
  await expect(cont).toBeDisabled();
  await page.getByRole("button", { name: "Female", exact: true }).click();
  await cont.click();

  await expect(cont).toBeDisabled();
  await page.getByRole("button", { name: "Speech therapy" }).click();
  await page.getByRole("button", { name: "Occupational therapy" }).click();
  await cont.click();

  await page.getByRole("button", { name: "Tue", exact: true }).click();
  await page.getByRole("button", { name: "Fri", exact: true }).click();
  await cont.click();

  await page.getByRole("button", { name: "Skip for now" }).click(); // IEP
  await page.getByRole("button", { name: "Go to Home" }).click();

  await expect(page.getByText("Anaya", { exact: true }).first()).toBeVisible();
  // All three onboarding questions were answered, so no "nudge" card asks them again.
  await expect(page.getByText(/What kind of support does Anaya get/)).toHaveCount(0);
  await expect(page.getByText(/Which days does Anaya usually have therapy/)).toHaveCount(0);
  await expect(page.getByText(/What's Anaya's gender/)).toHaveCount(0);
});

test("Back moves to the previous onboarding step and keeps what was typed", async ({ page, request }) => {
  await startOnboarding(page, request, "Ishaan");
  await expect(page.getByText("What's Ishaan's gender?")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Date of birth")).toHaveValue("2020-11-02");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Child's name")).toHaveValue("Ishaan");
});

test("uploading an IEP during onboarding adds the goals it found", async ({ page, request }) => {
  const skills = await demoSkillIds(request);
  await startOnboarding(page, request, "Vihaan");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Skip for now" }).click();

  await scriptAi(request, "extract-iep-goals", {
    newGoals: [
      { canonicalSkillId: skills[0], title: "Ask for help using two words", confidence: 0.92, sourceExcerpt: "will request help" },
      { canonicalSkillId: skills[1], title: "Follow two-step directions", confidence: 0.81, sourceExcerpt: "two-step directions" }
    ],
    statusUpdates: []
  });
  await page.locator("input[type=file]").setInputFiles(FAKE_SCAN);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByText("We found 2 possible goals")).toBeVisible();
  await expect(page.getByText("Ask for help using two words")).toBeVisible();
  await page.getByRole("button", { name: "Add these goals" }).click();

  await page.getByRole("button", { name: "Go to Home" }).click();
  await openTab(page, "Goals");
  await expect(page.getByText("Ask for help using two words")).toBeVisible();
  await expect(page.getByText("Follow two-step directions")).toBeVisible();
});

test("an IEP the AI finds nothing in can be skipped with 'Not now'", async ({ page, request }) => {
  await startOnboarding(page, request, "Reyansh");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Skip for now" }).click();
  await scriptAi(request, "extract-iep-goals", { newGoals: [], statusUpdates: [] });
  await page.locator("input[type=file]").setInputFiles(FAKE_SCAN);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // Whatever the app shows for "nothing found", the parent can still finish onboarding.
  const notNow = page.getByRole("button", { name: /Not now|Skip for now/ });
  await notNow.first().click();
  await page.getByRole("button", { name: "Go to Home" }).click();
  await openTab(page, "Goals");
  await expect(page.getByText(/Goals show up here/)).toBeVisible();
});
