import { expect, test } from "@playwright/test";
import { FAKE_SCAN, createFamily, listGoals, openTab, scriptAi, signIn } from "../../support/api";

const evidence = (goalId: string, itemHint: string | null, excerpt: string) => ({
  goalId,
  itemHint,
  outcome: "CORRECT",
  supportLevel: "INDEPENDENT",
  modality: "VERBAL",
  measurementValue: null,
  measurementUnit: null,
  measurementBoolean: null,
  measurementText: null,
  confidence: 0.9,
  excerpt
});

test.describe("logging a session with AI review", () => {
  test("write a note -> review what the AI found -> add only the approved entries", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 2 });
    const [g1, g2] = await listGoals(request, family.token, family.kidIds[0]);
    await scriptAi(request, "extract-evidence-from-note", {
      hasEvidence: true,
      evidence: [evidence(g1.id, null, "did it all by himself"), evidence(g2.id, null, "with a little help")]
    });

    await signIn(page, family.email, family.password, family.kidNames[0]);
    await page.getByRole("button", { name: "Log with a photo or voice note" }).click();
    await expect(page.locator("header p", { hasText: /^Log$/ })).toBeVisible();
    await page.locator("textarea").fill("Practised at home after dinner. He did it all by himself, then needed a little help.");
    await page.getByRole("button", { name: "Review with AI" }).click();

    await expect(page.getByText("Found 2 pieces of evidence", { exact: false })).toBeVisible();
    await page.locator("main button").filter({ hasText: "with a little help" }).click(); // uncheck the second
    await page.getByRole("button", { name: "Add 1 approved" }).click();
    await expect(page.getByText("Added 1 entry", { exact: false })).toBeVisible();

    // Exactly one entry was saved, on the first goal.
    const after = await listGoals(request, family.token, family.kidIds[0]);
    const count = (id: string) => after.find((g) => g.id === id)!.items.flatMap((i) => i.evidence).length;
    expect(count(g1.id)).toBe(1);
    expect(count(g2.id)).toBe(0);

    await page.getByRole("button", { name: "Back" }).click();
    await openTab(page, "Goals");
    await expect(page.locator("main button").filter({ hasText: g1.title })).toContainText("1 entr");
  });

  test("a note that matches no goal says so and saves nothing", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    await scriptAi(request, "extract-evidence-from-note", { hasEvidence: false, evidence: [] });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await page.getByRole("button", { name: "Log with a photo or voice note" }).click();
    await page.locator("textarea").fill("We went to the park.");
    await page.getByRole("button", { name: "Review with AI" }).click();
    await expect(page.getByText(/Nothing matched/)).toBeVisible();
  });

  test("when the AI fails, the parent sees an error and can try again", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    await scriptAi(request, "extract-evidence-from-note", "garbage");
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await page.getByRole("button", { name: "Log with a photo or voice note" }).click();
    await page.locator("textarea").fill("Some note");
    await page.getByRole("button", { name: "Review with AI" }).click();
    await expect(page.getByText(/couldn't|try again/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Review with AI" })).toBeEnabled();
  });

  test("Review stays disabled until something is written", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await page.getByRole("button", { name: "Log with a photo or voice note" }).click();
    await expect(page.getByRole("button", { name: "Review with AI" })).toBeDisabled();
    await page.locator("textarea").fill("x");
    await expect(page.getByRole("button", { name: "Review with AI" })).toBeEnabled();
  });
});

test.describe("logging from a photo, with a new centre", () => {
  test("photo of a note -> AI review -> add a new centre -> saved against that centre", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    const [goal] = await listGoals(request, family.token, family.kidIds[0]);
    await scriptAi(request, "extract-evidence-from-note", { hasEvidence: true, evidence: [evidence(goal.id, "Ball", "rolled the ball back")] });
    const centreName = `Sunshine Clinic ${Date.now()}`;

    await signIn(page, family.email, family.password, family.kidNames[0]);
    await page.getByRole("button", { name: "Log with a photo or voice note" }).click();
    await page.getByRole("button", { name: "Photo", exact: true }).click();
    await page.locator("input[type=file]").setInputFiles(FAKE_SCAN);
    await page.getByRole("button", { name: "Review with AI" }).click();

    await expect(page.getByText("Found 1 piece of evidence", { exact: false })).toBeVisible();
    await page.getByPlaceholder(/Bright Steps Clinic/).fill(centreName);
    await page.getByRole("button", { name: `+ Add "${centreName}" as a new centre` }).click();
    await page.getByRole("button", { name: "Add 1 approved" }).click();
    await expect(page.getByText("Added 1 entry", { exact: false })).toBeVisible();

    const after = (await listGoals(request, family.token, family.kidIds[0])) as unknown as { items: { evidence: { centre: { name: string } | null }[] }[] }[];
    expect(after[0].items.flatMap((i) => i.evidence).map((e) => e.centre?.name)).toEqual([centreName]);
  });
});

test.describe("logging from a voice note", () => {
  // The parent-mobile project gives the browser a fake microphone (see playwright.config.ts).
  test("record -> stop -> AI review -> add", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    const [goal] = await listGoals(request, family.token, family.kidIds[0]);
    await scriptAi(request, "extract-evidence-from-note", { hasEvidence: true, evidence: [evidence(goal.id, null, "said the word clearly")] });

    await signIn(page, family.email, family.password, family.kidNames[0]);
    await page.getByRole("button", { name: "Log with a photo or voice note" }).click();
    await page.getByRole("button", { name: "Voice", exact: true }).click();
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.getByText(/Recording\.\.\./)).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Stop recording" }).click();
    await expect(page.getByRole("button", { name: /Re-record/ })).toBeVisible();

    await page.getByRole("button", { name: "Review with AI" }).click();
    await expect(page.getByText("Found 1 piece of evidence", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Add 1 approved" }).click();
    await expect(page.getByText("Added 1 entry", { exact: false })).toBeVisible();
  });
});
