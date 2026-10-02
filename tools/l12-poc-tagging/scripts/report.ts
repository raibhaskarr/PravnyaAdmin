import fs from "node:fs";
import path from "node:path";
import { openDb } from "../lib/db";

function latestRunId(db: ReturnType<typeof openDb>, runType: string): number | null {
  const row = db.prepare("SELECT id FROM poc_runs WHERE run_type = ? ORDER BY id DESC LIMIT 1").get(runType) as { id: number } | undefined;
  return row?.id ?? null;
}

function bucketConfidence(rows: { confidence: number | null }[]) {
  const buckets = { "0.9-1.0": 0, "0.75-0.9": 0, "0.5-0.75": 0, "<0.5": 0, null: 0 };
  for (const r of rows) {
    if (r.confidence == null) buckets["null"] += 1;
    else if (r.confidence >= 0.9) buckets["0.9-1.0"] += 1;
    else if (r.confidence >= 0.75) buckets["0.75-0.9"] += 1;
    else if (r.confidence >= 0.5) buckets["0.5-0.75"] += 1;
    else buckets["<0.5"] += 1;
  }
  return buckets;
}

function main() {
  const db = openDb();
  const lines: string[] = [];
  const log = (s: string = "") => lines.push(s);

  log("# L12 AI-Tagging POC -- Results Summary");
  log(`Generated: ${new Date().toISOString()}`);
  log();

  // ── Goal tagging ──────────────────────────────────────────────────────
  const goalRunId = latestRunId(db, "goal_tagging");
  log("## Goal -> Canonical Skill tagging");
  if (goalRunId == null) {
    log("No goal_tagging run found.");
  } else {
    const run = db.prepare("SELECT * FROM poc_runs WHERE id = ?").get(goalRunId) as any;
    const tags = db.prepare("SELECT * FROM poc_goal_skill_tags WHERE run_id = ?").all(goalRunId) as any[];
    const totalGoals = db.prepare("SELECT COUNT(*) AS n FROM poc_source_goals").get() as any;

    log(`Run #${goalRunId} (${run.model_provider}), ${run.started_at} -> ${run.completed_at}`);
    log(`Total goals in snapshot: ${totalGoals.n}`);
    log(`Processed: ${run.records_processed}, succeeded: ${run.records_succeeded}, failed: ${run.records_failed}`);
    log();

    const tagged = tags.filter((t) => t.status === "tagged");
    const noMatch = tags.filter((t) => t.status === "no_match");
    const errored = tags.filter((t) => t.status === "error");
    log(`- Tagged with a skill: ${tagged.length} (${((tagged.length / tags.length) * 100).toFixed(0)}%)`);
    log(`- No reasonable match found: ${noMatch.length} (${((noMatch.length / tags.length) * 100).toFixed(0)}%)`);
    log(`- Errored: ${errored.length}`);
    log();
    log(`Confidence distribution (tagged only): ${JSON.stringify(bucketConfidence(tagged))}`);
    log();

    const bySkill = new Map<string, number>();
    for (const t of tagged) bySkill.set(t.predicted_skill_name, (bySkill.get(t.predicted_skill_name) ?? 0) + 1);
    const topSkills = [...bySkill.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    log("Top 10 most-tagged skills:");
    for (const [name, count] of topSkills) log(`  ${count}x  ${name}`);
    log();

    const allSkills = db.prepare("SELECT id, name FROM poc_taxonomy_skills").all() as any[];
    const taggedSkillIds = new Set(tagged.map((t) => t.predicted_skill_id));
    const zeroGoalCoverage = allSkills.filter((s) => !taggedSkillIds.has(s.id));
    log(`Skills with ZERO goal coverage across these ${totalGoals.n} real goals: ${zeroGoalCoverage.length} / ${allSkills.length}`);
    log("(Not necessarily a gap -- these two kids' goals don't have to span the whole taxonomy. Worth a skim, not a verdict.)");
    log();

    if (noMatch.length > 0) {
      log(`Sample "no match" rationale (first 5, titles omitted -- see DB for full detail if needed):`);
      for (const t of noMatch.slice(0, 5)) log(`  - ${t.rationale}`);
      log();
    }
  }

  // ── Log evidence extraction ──────────────────────────────────────────
  const logRunId = latestRunId(db, "log_evidence_extraction");
  log("## Daily Log -> Skill Evidence extraction");
  if (logRunId == null) {
    log("No log_evidence_extraction run found.");
  } else {
    const run = db.prepare("SELECT * FROM poc_runs WHERE id = ?").get(logRunId) as any;
    const evidence = db.prepare("SELECT * FROM poc_log_skill_evidence WHERE run_id = ?").all(logRunId) as any[];
    const totalLogs = db.prepare("SELECT COUNT(*) AS n FROM poc_source_logs").get() as any;
    const logsWithEvidence = new Set(evidence.map((e) => e.source_log_id)).size;

    log(`Run #${logRunId} (${run.model_provider}), ${run.started_at} -> ${run.completed_at}`);
    log(`Total logs in snapshot: ${totalLogs.n}`);
    log(`Processed: ${run.records_processed}, succeeded: ${run.records_succeeded}, failed: ${run.records_failed}`);
    log(`Logs with >=1 extracted evidence item: ${logsWithEvidence} (${((logsWithEvidence / run.records_succeeded) * 100).toFixed(0)}% of successfully processed logs)`);
    log(`Total evidence rows extracted: ${evidence.length} (avg ${(evidence.length / Math.max(1, logsWithEvidence)).toFixed(1)} per log that had any)`);
    log();

    log(`Confidence distribution: ${JSON.stringify(bucketConfidence(evidence))}`);
    log();

    const byOutcome = new Map<string, number>();
    for (const e of evidence) byOutcome.set(e.outcome, (byOutcome.get(e.outcome) ?? 0) + 1);
    log(`Outcome distribution: ${JSON.stringify(Object.fromEntries(byOutcome))}`);

    const bySupport = new Map<string, number>();
    for (const e of evidence) bySupport.set(e.support_level, (bySupport.get(e.support_level) ?? 0) + 1);
    log(`Support-level distribution: ${JSON.stringify(Object.fromEntries(bySupport))}`);
    log();

    const bySkill = new Map<string, number>();
    for (const e of evidence) bySkill.set(e.predicted_skill_name, (bySkill.get(e.predicted_skill_name) ?? 0) + 1);
    const topSkills = [...bySkill.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    log("Top 10 skills by evidence volume:");
    for (const [name, count] of topSkills) log(`  ${count}x  ${name}`);
    log();
  }

  // ── Cross-check: logs linked to a goal vs. that goal's own tag ───────
  log("## Cross-check: log evidence vs. the goal it's explicitly linked to");
  if (goalRunId != null && logRunId != null) {
    const linked = db
      .prepare(
        `SELECT l.id AS log_id, l.linked_iep_goal_id, gt.predicted_skill_id AS goal_skill_id, gt.predicted_skill_name AS goal_skill_name
         FROM poc_source_logs l
         JOIN poc_goal_skill_tags gt ON gt.source_goal_id = l.linked_iep_goal_id AND gt.run_id = ? AND gt.status = 'tagged'
         WHERE l.linked_iep_goal_id IS NOT NULL`
      )
      .all(goalRunId) as any[];

    let agree = 0;
    let disagree = 0;
    let noEvidence = 0;
    for (const row of linked) {
      const evidenceSkillIds = db
        .prepare("SELECT DISTINCT predicted_skill_id FROM poc_log_skill_evidence WHERE run_id = ? AND source_log_id = ?")
        .all(logRunId, row.log_id) as any[];
      if (evidenceSkillIds.length === 0) {
        noEvidence += 1;
      } else if (evidenceSkillIds.some((e) => e.predicted_skill_id === row.goal_skill_id)) {
        agree += 1;
      } else {
        disagree += 1;
      }
    }
    log(`${linked.length} logs are explicitly linked to a goal that was successfully tagged.`);
    log(`  - Agree (log evidence includes the linked goal's own tagged skill): ${agree}`);
    log(`  - Disagree (log has evidence, but for different skill(s) than the linked goal): ${disagree}`);
    log(`  - No evidence extracted from the log at all: ${noEvidence}`);
    log("This is the closest thing to a ground-truth check available without manual labeling --");
    log("a log explicitly tied to goal X should usually surface evidence for X's own skill.");
  } else {
    log("Need both a goal_tagging and a log_evidence_extraction run to compute this.");
  }

  const output = lines.join("\n");
  console.log(output);
  const outPath = path.join(__dirname, "..", "REPORT.md");
  fs.writeFileSync(outPath, output);
  console.log(`\n(also written to ${outPath})`);
  db.close();
}

main();
