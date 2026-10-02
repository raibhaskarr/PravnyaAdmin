import { z } from "zod";
import { textMessage, createExecutionContext } from "@pravnix/ai-core";
import { openDb } from "../lib/db";
import { orchestrator, ACTIVE_PROVIDER } from "../lib/aiPlatform";
import { mapWithConcurrency } from "../lib/concurrency";

const CONCURRENCY = 4;

const OUTCOMES = ["correct", "incorrect", "partial", "attempted", "not_observed", "unknown"] as const;
const SUPPORTS = ["independent", "visual_prompt", "verbal_prompt", "gestural_prompt", "physical_prompt", "partial_assistance", "full_assistance", "unknown"] as const;
const MODALITIES = ["verbal", "manual_sign", "aac", "written", "gestural", "unknown", "not_applicable"] as const;

// itemHint is a free-text description -- a second, AI-based pass (tag-items.ts) matches it against
// that skill's own real item bank afterward, now that this prompt pass (2026-10-01) fixed two
// issues found in the first run: bundled multi-item hints ("lego, clay, auto, bus" as one string)
// and category-level hints ("clothing items", "Currency") instead of one specific instance.
//
// modality (added 2026-10-02) captures HOW the child responded, independent of the item/outcome --
// e.g. pointed to an AAC device vs. said the word aloud -- distinct from the Canonical Skill's own
// supportedModalities (what the skill is designed to allow), which this never reads or is
// constrained by.
const SYSTEM_PROMPT =
  "You are helping test a clinical skill taxonomy (Domain > Skill) against real daily activity logs " +
  "written by therapists or parents. A single log entry can contain evidence for zero, one, or " +
  "several different skills or items -- create ONE separate evidence entry per distinct " +
  "skill+item combination. If a log says \"cricket 30%, badminton 70%, skating 100%\", that's three " +
  "entries. If a log says \"named lego, clay, auto, bus\" (all the same skill), that's FOUR separate " +
  "entries -- one per item -- never bundle multiple items into a single comma-separated itemHint.\n\n" +
  "For each piece of evidence found, extract: which candidate skill it demonstrates; itemHint -- the " +
  "ONE specific, concrete item/word/task actually involved (e.g. \"Apple\", \"Lego\", \"kick\"), " +
  "never a category or group label (e.g. never \"fruits\", \"clothing items\", \"body parts\") -- if " +
  "the log only mentions a general category with no specific instance named, set itemHint to null " +
  "rather than guessing a category name; the outcome; the support level the child needed; the " +
  "modality the child actually used to respond -- \"verbal\" (spoke/vocalized/said the word), " +
  "\"manual_sign\" (used a formal sign), \"aac\" (used an AAC device, picture exchange, or " +
  "communication app), \"written\" (wrote or typed), \"gestural\" (pointed or gestured without AAC " +
  "or a formal sign), \"not_applicable\" (this skill isn't about a communicative response at all, " +
  "e.g. a motor, behavioral, or self-care skill), or \"unknown\" (it's a communicative skill but the " +
  "log doesn't say how the child responded) -- infer modality only from what the log text actually " +
  "says, never guess based on the skill name alone; a confidence score; and the exact excerpt of the " +
  "log text that piece of evidence came from. Only extract evidence that is actually about skill " +
  "performance -- not attendance notes, scheduling, or unrelated remarks. This is a product-evidence " +
  "categorization aid, not a clinical or diagnostic judgment. Never invent a canonicalSkillId that " +
  "isn't in the candidate list.\n\n" +
  "Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in " +
  'exactly this shape: {"hasEvidence": boolean, "evidence": [{"canonicalSkillId": string, ' +
  '"itemHint": string or null, "outcome": one of ["correct","incorrect","partial","attempted",' +
  '"not_observed","unknown"], "supportLevel": one of ["independent","visual_prompt","verbal_prompt",' +
  '"gestural_prompt","physical_prompt","partial_assistance","full_assistance","unknown"], ' +
  '"modality": one of ["verbal","manual_sign","aac","written","gestural","unknown","not_applicable"], ' +
  '"confidence": number between 0 and 1, "excerpt": string}]}. "evidence" must be an empty array ' +
  "when hasEvidence is false. Up to 15 evidence items per log.";

interface SourceLog {
  id: string;
  child_id: string;
  log_date: string | null;
  category: string | null;
  source: string | null;
  free_text: string;
}

interface SkillCandidate {
  id: string;
  name: string;
  domain_name: string;
}

function buildSchema(validSkillIds: Set<string>) {
  const evidenceItem = z.object({
    canonicalSkillId: z.string().refine((id) => validSkillIds.has(id), { message: "Must be one of the provided candidate skill ids" }),
    itemHint: z.string().max(120).nullable(),
    outcome: z.enum(OUTCOMES),
    supportLevel: z.enum(SUPPORTS),
    modality: z.enum(MODALITIES),
    confidence: z.number().min(0).max(1),
    excerpt: z.string().min(1).max(300)
  });

  return z
    .object({
      hasEvidence: z.boolean(),
      evidence: z.array(evidenceItem).max(15)
    })
    .superRefine((value, ctx) => {
      if (!value.hasEvidence && value.evidence.length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "evidence must be empty when hasEvidence is false" });
      }
    });
}

async function extractOneLog(log: SourceLog, candidates: SkillCandidate[]) {
  const validIds = new Set(candidates.map((c) => c.id));
  const candidateLines = candidates.map((c) => `${c.id}\t${c.domain_name} > ${c.name}`).join("\n");
  const logText = [
    `Date: ${log.log_date ?? "unknown"}`,
    log.category ? `Category: ${log.category}` : null,
    log.source ? `Source: ${log.source}` : null,
    `Text:\n${log.free_text}`
  ]
    .filter(Boolean)
    .join("\n");

  return orchestrator.executeStructured({
    name: "poc.extract-log-evidence",
    request: {
      systemPrompt: SYSTEM_PROMPT,
      messages: [textMessage("user", `Daily log entry:\n${logText}\n\nCandidate skills (id, domain > name):\n${candidateLines}`)],
      executionContext: createExecutionContext({ productId: "l12-poc", tenantId: log.child_id, featureId: "extract-log-evidence" })
    },
    schema: buildSchema(validIds),
    maxRepairAttempts: 1
  });
}

function ensureProcessedLogTable(db: ReturnType<typeof openDb>) {
  db.exec(`CREATE TABLE IF NOT EXISTS poc_processed_logs (
    run_id INTEGER NOT NULL,
    source_log_id TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (run_id, source_log_id)
  )`);
}

async function main() {
  const db = openDb();
  ensureProcessedLogTable(db);
  const cols = (db.prepare("PRAGMA table_info(poc_log_skill_evidence)").all() as any[]).map((c) => c.name);
  if (!cols.includes("modality")) db.exec("ALTER TABLE poc_log_skill_evidence ADD COLUMN modality TEXT");

  const limit = process.env.POC_LIMIT ? Number(process.env.POC_LIMIT) : undefined;
  const resumeRunId = process.env.POC_RUN_ID ? Number(process.env.POC_RUN_ID) : undefined;

  const allLogs = db.prepare("SELECT * FROM poc_source_logs ORDER BY child_id, log_date").all() as unknown as SourceLog[];
  const candidates = db.prepare("SELECT id, name, domain_name FROM poc_taxonomy_skills").all() as unknown as SkillCandidate[];
  const skillNameById = new Map(candidates.map((c) => [c.id, c.name]));

  let runId: number;
  if (resumeRunId) {
    runId = resumeRunId;
    const alreadyDone = new Set(
      (db.prepare("SELECT source_log_id FROM poc_processed_logs WHERE run_id = ?").all(runId) as any[]).map((r) => r.source_log_id)
    );
    var logs = allLogs.filter((l) => !alreadyDone.has(l.id));
    console.log(`Resuming run_id=${runId}: ${alreadyDone.size} logs already processed, ${logs.length} remaining.`);
  } else {
    const startedAt = new Date().toISOString();
    runId = db
      .prepare("INSERT INTO poc_runs (run_type, model_provider, model_name, started_at) VALUES (?, ?, ?, ?)")
      .run("log_evidence_extraction", ACTIVE_PROVIDER, "default", startedAt).lastInsertRowid as number;
    var logs = allLogs;
    console.log(`New run_id=${runId}.`);
  }

  const targetLogs = limit ? logs.slice(0, limit) : logs;
  console.log(`Extracting evidence from ${targetLogs.length} logs against ${candidates.length} candidate skills, provider=${ACTIVE_PROVIDER}, concurrency=${CONCURRENCY}...`);

  const insert = db.prepare(
    `INSERT INTO poc_log_skill_evidence (run_id, source_log_id, child_id, predicted_skill_id, predicted_skill_name, predicted_item_id, predicted_item_name, outcome, support_level, modality, confidence, excerpt, rationale)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL)`
  );
  const markProcessed = db.prepare("INSERT OR REPLACE INTO poc_processed_logs (run_id, source_log_id, status) VALUES (?, ?, ?)");

  let succeeded = 0;
  let failed = 0;
  let evidenceRows = 0;

  await mapWithConcurrency(targetLogs, CONCURRENCY, async (log, index) => {
    try {
      const result = await extractOneLog(log, candidates);
      if (!result.success) {
        failed += 1;
        markProcessed.run(runId, log.id, "failed");
      } else {
        succeeded += 1;
        for (const item of result.value.evidence) {
          insert.run(
            runId,
            log.id,
            log.child_id,
            item.canonicalSkillId,
            skillNameById.get(item.canonicalSkillId) ?? null,
            item.itemHint,
            item.outcome,
            item.supportLevel,
            item.modality,
            item.confidence,
            item.excerpt
          );
          evidenceRows += 1;
        }
        markProcessed.run(runId, log.id, "succeeded");
      }
    } catch {
      failed += 1;
      markProcessed.run(runId, log.id, "failed");
    }
    if ((index + 1) % 50 === 0) console.log(`  ...${index + 1}/${targetLogs.length}`);
  });

  const totals = db.prepare("SELECT COUNT(*) AS n, SUM(status = 'succeeded') AS ok, SUM(status = 'failed') AS bad FROM poc_processed_logs WHERE run_id = ?").get(runId) as any;
  db.prepare("UPDATE poc_runs SET completed_at = ?, records_processed = ?, records_succeeded = ?, records_failed = ? WHERE id = ?").run(
    totals.n >= allLogs.length ? new Date().toISOString() : null,
    totals.n,
    totals.ok,
    totals.bad,
    runId
  );

  console.log(`Done this batch. run_id=${runId} batch_succeeded=${succeeded} batch_failed=${failed} evidence_rows_this_batch=${evidenceRows}`);
  console.log(`Run totals so far: ${totals.n}/${allLogs.length} logs processed (${totals.ok} ok, ${totals.bad} failed).`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
