import { expect, test } from "@playwright/test";
import { createFamily, listGoals, openTab, signIn, tabBar } from "../../support/api";

test("a parent with two children can switch between them", async ({ page, request }) => {
  const family = await createFamily(request, { kids: ["Aarav", "Diya"], goals: 1 });
  const [aaravGoal] = await listGoals(request, family.token, family.kidIds[0]);
  await signIn(page, family.email, family.password);

  // Starts on the first child; the name in the header is a switcher.
  await expect(page.getByRole("button", { name: "Aarav" })).toBeVisible();
  await openTab(page, "Goals");
  await expect(page.getByText(aaravGoal.title)).toBeVisible();

  await openTab(page, "Home");
  await page.getByRole("button", { name: "Aarav" }).click();
  await page.getByRole("button", { name: "Diya" }).click();
  await expect(page.getByRole("button", { name: "Diya" })).toBeVisible();

  // Diya has no goals: data really follows the selected child.
  await openTab(page, "Goals");
  await expect(page.getByText(aaravGoal.title)).toHaveCount(0);
  await expect(page.getByText(/Goals show up here/)).toBeVisible();
});

test.describe("on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("the left menu replaces the bottom tabs and works the same way", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    const navs = page.getByRole("navigation").filter({ visible: true });
    await expect(navs).toHaveCount(1);
    for (const tab of ["Growth", "Activities", "Goals", "Profile", "Home"] as const) {
      await openTab(page, tab);
      await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
    }
    await expect(tabBar(page)).toBeVisible();
  });
});
