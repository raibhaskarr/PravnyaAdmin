import { expect, test } from "@playwright/test";
import { emailsTo, nextEmailTo } from "../../support/outbox";
import { addScheduleSlot, createFamily, openTab, signIn, uniqueEmail } from "../../support/api";

test.describe("Profile: care team", () => {
  test("invite a therapist by email, resend, then cancel", async ({ page, request }) => {
    const family = await createFamily(request);
    const therapistEmail = uniqueEmail("therapist");
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Profile");
    await expect(page.getByText(/No one's linked to .* care team yet/)).toBeVisible();

    await page.getByPlaceholder("their.email@example.com").fill(therapistEmail);
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(page.getByText(therapistEmail, { exact: true })).toBeVisible();
    await expect(page.getByText("Invite sent", { exact: true })).toBeVisible();
    const invite = await nextEmailTo(request, therapistEmail);
    expect(invite.subject).toContain(`${family.kidNames[0]} Test's care team`);
    expect(invite.text).toMatch(/\/invite\/\S+/);

    await page.getByRole("button", { name: "Resend" }).click();
    await nextEmailTo(request, therapistEmail, 1);

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(therapistEmail, { exact: true })).toHaveCount(0);
  });

  test("inviting someone who is already a therapist links them straight away; Remove unlinks", async ({ page, request }) => {
    const family = await createFamily(request);
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Profile");
    const before = (await emailsTo(request, "demo.therapist@demo.pravnya.test")).length;

    await page.getByPlaceholder("their.email@example.com").fill("demo.therapist@demo.pravnya.test");
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(page.locator("p", { hasText: "Demo Therapist" })).toBeVisible();
    await expect(page.getByText("Invite sent", { exact: true })).toHaveCount(0);
    expect((await emailsTo(request, "demo.therapist@demo.pravnya.test")).length).toBe(before);

    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.locator("p", { hasText: "Demo Therapist" })).toHaveCount(0);
  });

  test("an invalid email can't be invited", async ({ page, request }) => {
    const family = await createFamily(request);
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Profile");
    await page.getByPlaceholder("their.email@example.com").fill("not-an-email");
    const invite = page.getByRole("button", { name: "Invite", exact: true });
    if (await invite.isEnabled()) {
      await invite.click();
      await expect(page.getByText("Invite sent", { exact: true })).toHaveCount(0);
    } else {
      await expect(invite).toBeDisabled();
    }
  });
});

test.describe("Profile: schedule", () => {
  test("add, edit and remove a weekly slot", async ({ page, request }) => {
    const family = await createFamily(request);
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Profile");
    await expect(page.getByText(/Nothing on .* schedule yet/)).toBeVisible();

    await page.getByRole("button", { name: "ABA", exact: true }).click();
    await page.getByRole("button", { name: "Thu", exact: true }).click();
    await page.getByLabel("Time").fill("10:30");
    await page.getByRole("button", { name: "Add to schedule" }).click();
    await expect(page.getByText(/Nothing on .* schedule yet/)).toHaveCount(0);
    await expect(page.getByText(/ABA/).first()).toBeVisible();
    await expect(page.getByText(/10:30|10.30 AM/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText("Editing this slot")).toBeVisible();
    await page.getByLabel("Time").fill("11:15");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/11:15|11.15 AM/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Remove slot" }).click();
    await expect(page.getByText(/Nothing on .* schedule yet/)).toBeVisible();
  });

  test("the same day and time can't be added twice", async ({ page, request }) => {
    const family = await createFamily(request);
    await addScheduleSlot(request, family.token, family.kidIds[0], { label: "Speech therapy", dayOfWeek: "Mon", startTime: "16:00" });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Profile");
    await page.getByRole("button", { name: "Physiotherapy", exact: true }).click();
    await page.getByRole("button", { name: "Mon", exact: true }).last().click();
    await page.getByLabel("Time").fill("16:00");
    await page.getByRole("button", { name: "Add to schedule" }).click();
    await expect(page.getByText("Mon at 16:00 is already on the schedule.")).toBeVisible();
  });
});
