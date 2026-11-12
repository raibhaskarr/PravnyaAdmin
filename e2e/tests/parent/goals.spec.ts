import { expect, test } from "@playwright/test";
import { FAKE_SCAN, createFamily, demoSkillIds, listGoals, openTab, scriptAi, signIn } from "../../support/api";

test.describe("Goals", () => {
  test("log an entry by hand from a goal's page", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    const [goal] = await listGoals(request, family.token, family.kidIds[0]);
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Goals");

    await page.locator("main button").filter({ hasText: goal.title }).click();
    await expect(page.getByText("Nothing logged yet.")).toBeVisible();
    await page.getByRole("button", { name: "Log something for this goal" }).click();
    await page.getByRole("button", { name: "Did it independently" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText("Nothing logged yet.")).toHaveCount(0);
    await expect(page.getByText("Recent entries")).toBeVisible();
    const after = await listGoals(request, family.token, family.kidIds[0]);
    expect(after[0].items.flatMap((i) => i.evidence)).toHaveLength(1);
  });

  test("the log form can be cancelled without saving", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    const [goal] = await listGoals(request, family.token, family.kidIds[0]);
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Goals");
    await page.locator("main button").filter({ hasText: goal.title }).click();
    await page.getByRole("button", { name: "Log something for this goal" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Log something for this goal" })).toBeVisible();
    expect((await listGoals(request, family.token, family.kidIds[0]))[0].items.flatMap((i) => i.evidence)).toHaveLength(0);
  });

  test("Upload IEP from Goals: review, uncheck, add -- then Back returns to Goals", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    const [existing] = await listGoals(request, family.token, family.kidIds[0]);
    const skills = await demoSkillIds(request);
    await scriptAi(request, "extract-iep-goals", {
      newGoals: [
        { canonicalSkillId: skills[2], title: "Take turns in a simple game", confidence: 0.88, sourceExcerpt: "turn-taking" },
        { canonicalSkillId: skills[3], title: "Name five animals", confidence: 0.7, sourceExcerpt: "animals" }
      ],
      statusUpdates: [
        {
          goalId: existing.id, itemHint: null, outcome: "PARTIAL", supportLevel: "VERBAL_PROMPT", modality: "VERBAL",
          measurementValue: null, measurementUnit: null, measurementBoolean: null, measurementText: null,
          confidence: 0.8, excerpt: "progressing with verbal prompts"
        }
      ]
    });

    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Goals");
    await page.getByRole("button", { name: "Upload IEP" }).click();
    // Upload IEP is a one-off task: full screen, no tab bar.
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await page.locator("input[type=file]").setInputFiles(FAKE_SCAN);
    await page.getByRole("button", { name: "Review with AI" }).click();

    await expect(page.getByText("Updates to existing goals")).toBeVisible();
    await expect(page.getByText("New goals")).toBeVisible();
    await page.locator("main button").filter({ hasText: "Name five animals" }).click(); // uncheck
    await page.getByRole("button", { name: "Add 2 approved" }).click();

    await expect(page.locator("header p", { hasText: "Goals" })).toBeVisible();
    await expect(page.getByText("Take turns in a simple game")).toBeVisible();
    await expect(page.getByText("Name five animals")).toHaveCount(0);
    const after = await listGoals(request, family.token, family.kidIds[0]);
    expect(after).toHaveLength(2);
    expect(after.find((g) => g.id === existing.id)!.items.flatMap((i) => i.evidence)).toHaveLength(1);
  });

  test("Back from Upload IEP returns to the Goals tab", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Goals");
    await page.getByRole("button", { name: "Upload IEP" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator("header p", { hasText: "Goals" })).toBeVisible();
  });

  test("a goal shows where it came from", async ({ page, request }) => {
    const family = await createFamily(request, { goals: 1 });
    await signIn(page, family.email, family.password, family.kidNames[0]);
    await openTab(page, "Goals");
    await expect(page.getByText("From your IEP upload").first()).toBeVisible();
  });
});
