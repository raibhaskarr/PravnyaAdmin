import { expect, test } from "@playwright/test";
import { DEMO_PARENT } from "../../support/env";
import { createCentre, createFamily, listGoals, logEvidence, openTab, signIn } from "../../support/api";

test.describe("Growth", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, DEMO_PARENT.email, DEMO_PARENT.password, DEMO_PARENT.kidName);
    await openTab(page, "Growth");
  });

  test("shows the highlight and summary tiles", async ({ page }) => {
    await expect(page.getByText("Growth highlight", { exact: false })).toBeVisible();
    for (const tile of [/Getting stronger/i, /Showing up at home/i, /Goals with evidence/i]) await expect(page.getByText(tile)).toBeVisible();
  });

  test("Simple and Detailed views both render", async ({ page }) => {
    await page.getByRole("button", { name: "Detailed", exact: true }).click();
    await expect(page.getByRole("button", { name: "Detailed", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Simple", exact: true }).click();
    await expect(page.getByText(/Steady|Recently/).first()).toBeVisible();
  });

  test("'What do the colored bars mean?' explains the bars", async ({ page }) => {
    await page.getByText("What do the colored bars mean?").click();
    await expect(page.getByText(/independent|help|prompt/i).first()).toBeVisible();
  });

  test("a goal opens its detail with Back, and the tab bar stays", async ({ page }) => {
    await page.locator("main button").filter({ hasText: /last 5/ }).first().click();
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation").filter({ visible: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByText("Growth highlight", { exact: false })).toBeVisible();
  });

});

test("Growth: a child with nothing logged gets a friendly empty state", async ({ page, request }) => {
  const family = await createFamily(request);
  await signIn(page, family.email, family.password, family.kidNames[0]);
  await openTab(page, "Growth");
  await expect(page.getByText(/No practice history logged/)).toBeVisible();
});

test.describe("Activities", () => {
  test("a goal confirmed at a centre but not yet tried at home is suggested, and logging a home try counts", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    const [goal] = await listGoals(request, family.token, family.kidIds[0]);
    const centre = await createCentre(request, family.token, `Bright Steps ${Date.now()}`);
    await logEvidence(request, family.token, family.kidIds[0], goal.id, { centreId: centre.id, item: "Ball", daysAgo: 3 });
    await logEvidence(request, family.token, family.kidIds[0], goal.id, { centreId: centre.id, item: "Ball", daysAgo: 2 });

    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Activities");
    const card = page.locator("main button").filter({ hasText: goal.title });
    await expect(card).toContainText("Centre 2 · Home 0");
    await expect(page.getByText(/Confirmed at/).first()).toContainText(centre.name);

    await card.click();
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Did it independently" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(card).toContainText("Centre 2 · Home 1");
  });

  test("with nothing waiting, Activities says so", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Activities");
    await expect(page.getByText(/Nothing waiting on a home try/)).toBeVisible();
  });
});
