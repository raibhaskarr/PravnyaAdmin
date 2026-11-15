import { expect, test } from "@playwright/test";
import { verificationCodeFor } from "../../support/outbox";

test("a new parent signs up, adds their child and lands on Home", async ({ page, request }) => {
  const email = `e2e.parent+${Date.now()}@test.local`;
  const continueBtn = page.getByRole("button", { name: "Continue", exact: true });

  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("E2e-strong-pass-1");
  await page.locator("button[type=submit]").click();

  await page.getByLabel("Your name").fill("Riya Test");
  await page.locator("button[type=submit]").click();

  await expect(continueBtn).toBeDisabled();
  await page.getByLabel("Confirm parent or guardian consent").check();
  await continueBtn.click();

  await page.getByLabel("Verification code").fill(await verificationCodeFor(request, email));
  await continueBtn.click();

  await page.getByLabel("Child's name").fill("Kabir");
  await continueBtn.click();
  await page.getByLabel("Date of birth").fill("2021-03-09");
  await continueBtn.click();

  // The optional steps can all be skipped.
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Skip for now" }).click();

  await expect(page.getByText("You're all set")).toBeVisible();
  await page.getByRole("button", { name: "Go to Home" }).click();

  await expect(page.getByText("Kabir", { exact: true })).toBeVisible();
  await expect(page.getByText("Signed in as Riya Test")).toBeVisible();
});

test("a wrong verification code is rejected", async ({ page, request }) => {
  const email = `e2e.badcode+${Date.now()}@test.local`;
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("E2e-strong-pass-1");
  await page.locator("button[type=submit]").click();
  await page.getByLabel("Your name").fill("Wrong Code");
  await page.locator("button[type=submit]").click();
  await page.getByLabel("Confirm parent or guardian consent").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const real = await verificationCodeFor(request, email);
  await page.getByLabel("Verification code").fill(real === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByText(/incorrect verification code/i)).toBeVisible();
  await expect(page.getByLabel("Verification code")).toBeVisible();
});
