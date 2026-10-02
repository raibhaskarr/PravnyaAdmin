import { z } from "zod";
import { textMessage, createExecutionContext } from "@pravnix/ai-core";
import { openDb } from "../lib/db";
import { orchestrator, ACTIVE_PROVIDER } from "../lib/aiPlatform";
import { mapWithConcurrency } from "../lib/concurrency";

const CONCURRENCY = 4;

const SYSTEM_PROMPT =
  "You are helping test a clinical skill taxonomy (Domain > Skill) against real therapy goals " +
  "written by therapists/parents, often copied from an IEP. Given one goal's title and description, " +
  "pick the single best-matching canonicalSkillId from the candidate list provided, or say there is " +
  "no reasonable match at all. This is a product-evidence categorization aid, not a clinical or " +
  "diagnostic judgment. Never invent an id that isn't in the candidate list.\n\n" +
  "Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in " +
  'exactly this shape: {"hasMatch": boolean, "canonicalSkillId": string or null, "confidence": ' +
  'number between 0 and 1, "rationale": string}. canonicalSkillId must be null when hasMatch is ' +
  "false, and must be exactly one of the candidate ids when hasMatch is true.";

interface SourceGoal {
  id: string;
  child_id: string;
  domain_name: string | null;
  category: string | null;
  title: string;
  description: string | null;
  target_behavior: string | null;
  measurement_method: string | null;
}

interface SkillCandidate {
  id: string;
  name: string;
  domain_name: string;
}

function buildSchema(validIds: Set<string>) {
  return z
    .object({
      hasMatch: z.boolean(),
      canonicalSkillId: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      rationale: z.string().min(1).max(400)
    })
    .superRefine((value, ctx) => {
      if (value.hasMatch && (!value.canonicalSkillId || !validIds.has(value.canonicalSkillId))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "canonicalSkillId must be one of the candidate ids when hasMatch is true" });
      }
      if (!value.hasMatch && value.canonicalSkillId !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "canonicalSkillId must be null when hasMatch is false" });
      }
    });
}

async function tagOneGoal(goal: SourceGoal, candidates: SkillCandidate[]) {
  const validIds = new Set(candidates.map((c) => c.id));
  const candidateLines = candidates.map((c) => `${c.id}\t${c.domain_name} > ${c.name}`).join("\n");
  const goalText = [
    `Title: ${goal.title}`,
    goal.description ? `Description: ${goal.description}` : null,
    goal.target_behavior ? `Target behavior: ${goal.target_behavior}` : null,
    goal.measurement_method ? `Measurement method: ${goal.measurement_method}` : null,
    goal.domain_name ? `Original domain (as entered, not canonical): ${goal.domain_name}` : null,
    goal.category ? `Original category: ${goal.category}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return orchestrator.executeStructured({
    name: "poc.tag-goal",
    request: {
      systemPrompt: SYSTEM_PROMPT,
      messages: [textMessage("user", `Goal:\n${goalText}\n\nCandidate skills (id, domain > name):\n${candidateLines}`)],
      executionContext: createExecutionContext({ productId: "l12-poc", tenantId: goal.child_id, featureId: "tag-goal" })
    },
    schema: buildSchema(validIds),
    maxRepairAttempts: 1
  });
}

async function main() {
  const db = openDb();
  const limit = process.env.POC_LIMIT ? Number(process.env.POC_LIMIT) : undefined;
  const allGoals = db.prepare("SELECT * FROM poc_source_goals ORDER BY child_id, id").all() as unknown as SourceGoal[];
  const goals = limit ? allGoals.slice(0, limit) : allGoals;
  const candidates = db.prepare("SELECT id, name, domain_name FROM poc_taxonomy_skills").all() as unknown as SkillCandidate[];
  const skillNameById = new Map(candidates.map((c) => [c.id, c.name]));

  console.log(`Tagging ${goals.length} goals against ${candidates.length} candidate skills, provider=${ACTIVE_PROVIDER}, concurrency=${CONCURRENCY}...`);

  const startedAt = new Date().toISOString();
  const runId = db
    .prepare("INSERT INTO poc_runs (run_type, model_provider, model_name, started_at) VALUES (?, ?, ?, ?)")
    .run("goal_tagging", ACTIVE_PROVIDER, "default", startedAt).lastInsertRowid as number;
  // Prior runs' rows are kept (not deleted) -- poc_runs lets the report script compare across
  // providers/prompt versions by run_id, which is the whole point of keeping this swappable.

  const insert = db.prepare(
    `INSERT INTO poc_goal_skill_tags (run_id, source_goal_id, child_id, predicted_skill_id, predicted_skill_name, confidence, rationale, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let succeeded = 0;
  let failed = 0;

  await mapWithConcurrency(goals, CONCURRENCY, async (goal, index) => {
    try {
      const result = await tagOneGoal(goal, candidates);
      if (!result.success) {
        insert.run(runId, goal.id, goal.child_id, null, null, null, null, "error", result.error.safeMessage);
        failed += 1;
      } else if (!result.value.hasMatch) {
        insert.run(runId, goal.id, goal.child_id, null, null, result.value.confidence, result.value.rationale, "no_match", null);
        succeeded += 1;
      } else {
        const skillId = result.value.canonicalSkillId!;
        insert.run(runId, goal.id, goal.child_id, skillId, skillNameById.get(skillId) ?? null, result.value.confidence, result.value.rationale, "tagged", null);
        succeeded += 1;
      }
    } catch (err) {
      insert.run(runId, goal.id, goal.child_id, null, null, null, null, "error", err instanceof Error ? err.message : String(err));
      failed += 1;
    }
    if ((index + 1) % 20 === 0) console.log(`  ...${index + 1}/${goals.length}`);
  });

  db.prepare("UPDATE poc_runs SET completed_at = ?, records_processed = ?, records_succeeded = ?, records_failed = ? WHERE id = ?").run(
    new Date().toISOString(),
    goals.length,
    succeeded,
    failed,
    runId
  );

  console.log(`Done. run_id=${runId} succeeded=${succeeded} failed=${failed}`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
