import assert from "node:assert/strict";
import { test } from "node:test";
import { createAiPlatform, createFakeProvider } from "@pravnix/ai-node";
import type { Modality } from "@prisma/client";
import { deriveDisciplineAndModality, pickCandidateSkill } from "./goalSkillSuggestion.service";

const CANDIDATES = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Identifies objects when named", domainName: "Receptive Language" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Requests preferred items", domainName: "Expressive Language" }
];

function fakeOrchestrator(responseText: string) {
  return createAiPlatform({
    providers: [createFakeProvider({ responseSelector: () => responseText })],
    defaultProvider: "fake"
  }).orchestrator;
}

test("pickCandidateSkill accepts a valid candidate id from the model", async () => {
  const orchestrator = fakeOrchestrator(
    JSON.stringify({ canonicalSkillId: CANDIDATES[0].id, rationale: "Matches receptive identification." })
  );
  const result = await pickCandidateSkill("Point to the picture when named", CANDIDATES, orchestrator);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.canonicalSkillId, CANDIDATES[0].id);
    assert.equal(result.rationale, "Matches receptive identification.");
  }
});

test("pickCandidateSkill rejects a hallucinated id not in the candidate set", async () => {
  const orchestrator = fakeOrchestrator(JSON.stringify({ canonicalSkillId: "not-a-real-id", rationale: "made up" }));
  const result = await pickCandidateSkill("Some goal", CANDIDATES, orchestrator);
  assert.equal(result.success, false);
});

test("pickCandidateSkill fails gracefully on non-JSON model output", async () => {
  const orchestrator = fakeOrchestrator("I think the answer is probably the first one.");
  const result = await pickCandidateSkill("Some goal", CANDIDATES, orchestrator);
  assert.equal(result.success, false);
});

test("pickCandidateSkill returns failure immediately with an empty candidate list, without calling the model", async () => {
  let called = false;
  const orchestrator = createAiPlatform({
    providers: [
      createFakeProvider({
        responseSelector: () => {
          called = true;
          return JSON.stringify({ canonicalSkillId: "x", rationale: "x" });
        }
      })
    ],
    defaultProvider: "fake"
  }).orchestrator;

  const result = await pickCandidateSkill("Some goal", [], orchestrator);
  assert.equal(result.success, false);
  assert.equal(called, false);
});

test("deriveDisciplineAndModality prefers the skill's default discipline when the tenant has it enabled", () => {
  const { disciplineId, modality } = deriveDisciplineAndModality(
    { defaultDisciplineId: "slp-id", supportedModalities: ["VERBAL", "AAC"] as Modality[] },
    ["ot-id", "slp-id"]
  );
  assert.equal(disciplineId, "slp-id");
  assert.equal(modality, "VERBAL");
});

test("deriveDisciplineAndModality falls back to the tenant's first enabled discipline when the default isn't enabled", () => {
  const { disciplineId } = deriveDisciplineAndModality({ defaultDisciplineId: "slp-id", supportedModalities: [] }, ["ot-id", "aba-id"]);
  assert.equal(disciplineId, "ot-id");
});

test("deriveDisciplineAndModality falls back when the skill has no default discipline at all", () => {
  const { disciplineId } = deriveDisciplineAndModality({ defaultDisciplineId: null, supportedModalities: [] }, ["ot-id"]);
  assert.equal(disciplineId, "ot-id");
});

test("deriveDisciplineAndModality returns null discipline when the tenant has none enabled", () => {
  const { disciplineId, modality } = deriveDisciplineAndModality({ defaultDisciplineId: null, supportedModalities: [] }, []);
  assert.equal(disciplineId, null);
  assert.equal(modality, null);
});
