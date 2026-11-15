import { expect, test } from "@playwright/test";
import { emailsTo, verificationCodeFor } from "../../support/outbox";
import { createFamily, signIn, uniqueEmail } from "../../support/api";

test.describe("signing in and recovering access", () => {
  test("forgot password: code by email, new password works, old one doesn't", async ({ page, request }) => {
    const family = await createFamily(request);
    await page.goto("/");
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.getByRole("button", { name: "Forgot password?" }).click();

    await page.getByLabel("Email").fill(family.email);
    const before = (await emailsTo(request, family.email)).length;
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Verification code").fill(await verificationCodeFor(request, family.email, before));
    await page.getByLabel("New password").fill("Brand-new-pass-42");
    await page.getByRole("button", { name: "Reset password" }).click();

    // Resetting signs you straight in.
    await expect(page.getByText(family.kidNames[0], { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await signIn(page, family.email, "Brand-new-pass-42", family.kidNames[0]);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.getByLabel("Email").fill(family.email);
    await page.getByLabel("Password").fill(family.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
  });

  test("forgot password with a wrong code shows an error", async ({ page, request }) => {
    const family = await createFamily(request);
    await page.goto("/");
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(family.email);
    const before = (await emailsTo(request, family.email)).length;
    await page.getByRole("button", { name: "Send code" }).click();
    const real = await verificationCodeFor(request, family.email, before);
    await page.getByLabel("Verification code").fill(real === "000000" ? "111111" : "000000");
    await page.getByLabel("New password").fill("Brand-new-pass-42");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText(/incorrect verification code/i)).toBeVisible();
  });

  test("staying signed in: a reload resumes Home", async ({ page, request }) => {
    const family = await createFamily(request);
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await page.reload();
    await expect(page.getByText(family.kidNames[0], { exact: true }).first()).toBeVisible();
  });

  test("an expired or invalid saved session goes back to Welcome", async ({ page, request }) => {
    const family = await createFamily(request);
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (/token/i.test(key)) localStorage.setItem(key, "expired.or.tampered");
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
  });

  test("'New here? Create an account' from Sign in starts onboarding", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.getByRole("button", { name: /Create an account/ }).click();
    await expect(page.getByText("Let's get set up")).toBeVisible();
  });

  test("signing up with an email that already has an account is refused", async ({ page, request }) => {
    const family = await createFamily(request);
    await page.goto("/");
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByLabel("Email").fill(family.email);
    await page.getByLabel("Password").fill("Another-pass-123");
    await page.locator("button[type=submit]").click();
    await page.getByLabel("Your name").fill("Someone Else");
    await page.locator("button[type=submit]").click();
    await page.getByLabel("Confirm parent or guardian consent").check();
    const before = (await emailsTo(request, family.email)).length;
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Verification code").fill(await verificationCodeFor(request, family.email, before));
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible();
  });

  test("create-login validation: bad email and short password keep Continue disabled", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Get started" }).click();
    const submit = page.locator("button[type=submit]");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await expect(submit).toBeDisabled();
    await page.getByLabel("Email").fill(uniqueEmail("valid"));
    await page.getByLabel("Password").fill("long-enough-1");
    await expect(submit).toBeEnabled();
  });
});
