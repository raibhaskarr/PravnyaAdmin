import { expect, test, type Page } from "@playwright/test";
import { DEMO_PARENT } from "../../support/env";

async function signIn(page: Page, email = DEMO_PARENT.email, password = DEMO_PARENT.password) {
  await page.goto("/");
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

// The phone-width bottom tab bar (the left rail is hidden at this size).
const tabBar = (page: Page) => page.getByRole("navigation").filter({ visible: true }).last();

test.describe("demo family on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await expect(page.getByText(DEMO_PARENT.kidName, { exact: true })).toBeVisible();
  });

  test("every tab keeps the bottom tab bar, marks itself current and has no Back arrow", async ({ page }) => {
    for (const tab of ["Growth", "Activities", "Goals", "Profile", "Home"]) {
      await tabBar(page).getByRole("button", { name: new RegExp(tab) }).click();
      await expect(tabBar(page).getByRole("button", { name: new RegExp(tab) })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
    }
  });

  test("Growth tells a progress story from the logged sessions", async ({ page }) => {
    await tabBar(page).getByRole("button", { name: /Growth/ }).click();
    await expect(page.getByText("Growth highlight", { exact: false })).toBeVisible();
    await expect(page.getByText(/getting stronger/i)).toBeVisible();
  });

  test("Goals lists the child's goals and a goal opens with Back to the list", async ({ page }) => {
    await tabBar(page).getByRole("button", { name: /Goals/ }).click();
    const goalCards = page.locator("main button").filter({ hasText: "independently" });
    await expect(goalCards).toHaveCount(6);

    await goalCards.first().click();
    await expect(page.getByRole("button", { name: "Log something for this goal" })).toBeVisible();
    await expect(tabBar(page)).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(goalCards).toHaveCount(6);
  });

  test("Profile shows the linked therapist and the weekly schedule", async ({ page }) => {
    await tabBar(page).getByRole("button", { name: /Profile/ }).click();
    await expect(page.getByText("Demo Therapist").first()).toBeVisible();
    await expect(page.getByText(/Mon/).first()).toBeVisible();
  });

  test("signing out returns to Welcome", async ({ page }) => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
  });
});

test("a wrong password shows an error and stays on Sign in", async ({ page }) => {
  await signIn(page, DEMO_PARENT.email, "definitely-wrong-password");
  await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});
