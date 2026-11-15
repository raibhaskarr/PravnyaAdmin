import { expect, test } from "@playwright/test";
import { SUPERADMIN } from "../../support/env";

test("superadmin signs in and reaches the tenants list", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SUPERADMIN.email);
  await page.getByLabel("Password").fill(SUPERADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/tenants/);
  await expect(page.getByText("Pravnix Labs (demo)").first()).toBeVisible();
});

test("a wrong password is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SUPERADMIN.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/incorrect|invalid/i).first()).toBeVisible();
});
