import { z } from "zod";
import { textMessage, createExecutionContext } from "@pravnix/ai-core";
import { openDb } from "../lib/db";
import { orchestrator, ACTIVE_PROVIDER } from "../lib/aiPlatform";
import { mapWithConcurrency } from "../lib/concurrency";

const CONCURRENCY = 4;

// Runs locally only -- the original log free_text is used as context for this call (never sent to
// PravnyaAdmin, see the earlier excerpt-privacy decision for the review page itself).
const SYSTEM_PROMPT =
  "You are helping test a clinical skill taxonomy's item bank. A piece of evidence has already been " +
  "matched to a specific Canonical Skill; your only job now is picking which ONE item from that " +
  "skill's own candidate item list (if any) the evidence actually refers to, using the original log " +
  "text and a short item hint for context. Pick the closest real match even if the wording differs " +
  "(e.g. hint \"ball\" can match a candidate like \"Catch\" if the log context makes that the right " +
  "action) -- but say there's no match rather than forcing a wrong one if nothing fits. Never invent " +
  "an itemId that isn't in the candidate list.\n\n" +
  "Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in " +
  'exactly this shape: {"hasMatch": boolean, "itemId": string or null, "confidence": number between ' +
  '0 and 1, "rationale": string}. itemId must be null when hasMatch is false, and must be exactly ' +
  "one of the candidate ids when hasMatch is true.";

interface EvidenceRow {
  id: number;
  predicted_skill_id: string;
  skill_name: string;
  predicted_item_name: string;
  free_text: string;
}

interface ItemCandidate {
  id: string;
  display_name: string;
}

function buildSchema(validItemIds: Set<string>) {
  return z
    .object({
      hasMatch: z.boolean(),
      itemId: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      rationale: z.string().min(1).max(300)
    })
    .superRefine((value, ctx) => {
      if (value.hasMatch && (!value.itemId || !validItemIds.has(value.itemId))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "itemId must be one of the candidate ids when hasMatch is true" });
      }
      if (!value.hasMatch && value.itemId !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "itemId must be null when hasMatch is false" });
      }
    });
}

async function tagOneItem(row: EvidenceRow, candidates: ItemCandidate[]) {
  const validIds = new Set(candidates.map((c) => c.id));
  const candidateLines = candidates.map((c) => `${c.id}\t${c.display_name}`).join("\n");

  return orchestrator.executeStructured({
    name: "poc.tag-item",
    request: {
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        textMessage(
          "user",
          `Skill: ${row.skill_name}\nItem hint from prior extraction: "${row.predicted_item_name}"\n\nOriginal log text:\n${row.free_text}\n\nCandidate items for this skill (id, name):\n${candidateLines}`
        )
      ],
      executionContext: createExecutionContext({ productId: "l12-poc", featureId: "tag-item" })
    },
    schema: buildSchema(validIds),
    maxRepairAttempts: 1
  });
}

function main() {
  const db = openDb();
  const cols = (db.prepare("PRAGMA table_info(poc_log_skill_evidence)").all() as any[]).map((c) => c.name);
  if (!cols.includes("item_match_score")) db.exec("ALTER TABLE poc_log_skill_evidence ADD COLUMN item_match_score REAL");
  if (!cols.includes("item_match_method")) db.exec("ALTER TABLE poc_log_skill_evidence ADD COLUMN item_match_method TEXT");

  // POC_RUN_ID targets a specific extraction run explicitly -- needed once more than one
  // provider's run exists, since the globally-latest run is no longer necessarily the one you want
  // to (re-)tag.
  let runId: number;
  if (process.env.POC_RUN_ID) {
    runId = Number(process.env.POC_RUN_ID);
  } else {
    const runRow = db.prepare("SELECT MAX(id) AS id FROM poc_runs WHERE run_type = 'log_evidence_extraction'").get() as any;
    runId = runRow.id;
  }

  // item_match_method IS NULL means "never touched by this script yet" -- both the pre-filter
  // (not_applicable/no_hint) and the AI loop set it to a non-null value, so a restart after a kill
  // naturally only picks up rows genuinely still pending, without reprocessing finished ones.
  const allRows = db
    .prepare(
      `SELECT e.id, e.predicted_skill_id, s.name AS skill_name, s.supports_items, e.predicted_item_name, l.free_text
       FROM poc_log_skill_evidence e
       JOIN poc_taxonomy_skills s ON s.id = e.predicted_skill_id
       JOIN poc_source_logs l ON l.id = e.source_log_id
       WHERE e.run_id = ? AND e.item_match_method IS NULL`
    )
    .all(runId) as any[];

  const update = db.prepare(
    "UPDATE poc_log_skill_evidence SET predicted_item_id = ?, item_match_score = ?, item_match_method = ? WHERE id = ?"
  );

  const itemsBySkill = new Map<string, ItemCandidate[]>();
  function itemsFor(skillId: string): ItemCandidate[] {
    if (!itemsBySkill.has(skillId)) {
      const rows = db.prepare("SELECT id, display_name FROM poc_taxonomy_skill_items WHERE skill_id = ?").all(skillId) as ItemCandidate[];
      itemsBySkill.set(skillId, rows);
    }
    return itemsBySkill.get(skillId)!;
  }

  const toTag: EvidenceRow[] = [];
  let notApplicable = 0;
  let noHint = 0;

  for (const row of allRows) {
    if (!row.supports_items) {
      update.run(null, null, "not_applicable", row.id);
      notApplicable += 1;
      continue;
    }
    if (!row.predicted_item_name) {
      update.run(null, null, "no_hint", row.id);
      noHint += 1;
      continue;
    }
    toTag.push(row as EvidenceRow);
  }

  console.log(`run_id=${runId}: ${allRows.length} total, ${notApplicable} not_applicable, ${noHint} no_hint, ${toTag.length} to AI-tag, provider=${ACTIVE_PROVIDER}`);

  (async () => {
    let matched = 0;
    let noMatch = 0;
    let errored = 0;

    await mapWithConcurrency(toTag, CONCURRENCY, async (row, index) => {
      const candidates = itemsFor(row.predicted_skill_id);
      if (candidates.length === 0) {
        update.run(null, null, "no_match", row.id);
        noMatch += 1;
        return;
      }
      try {
        const result = await tagOneItem(row, candidates);
        if (!result.success) {
          update.run(null, null, "ai_error", row.id);
          errored += 1;
        } else if (!result.value.hasMatch) {
          update.run(null, result.value.confidence, "ai_no_match", row.id);
          noMatch += 1;
        } else {
          update.run(result.value.itemId, result.value.confidence, "ai", row.id);
          matched += 1;
        }
      } catch {
        update.run(null, null, "ai_error", row.id);
        errored += 1;
      }
      if ((index + 1) % 50 === 0) console.log(`  ...${index + 1}/${toTag.length}`);
    });

    console.log(`Done. matched=${matched} no_match=${noMatch} errored=${errored}`);
    db.close();
  })();
}

main();
