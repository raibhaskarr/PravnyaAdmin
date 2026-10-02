import { openDb } from "../lib/db";
import { matchItem } from "../lib/textMatch";

function ensureColumns(db: ReturnType<typeof openDb>) {
  const cols = (db.prepare("PRAGMA table_info(poc_log_skill_evidence)").all() as any[]).map((c) => c.name);
  if (!cols.includes("item_match_score")) db.exec("ALTER TABLE poc_log_skill_evidence ADD COLUMN item_match_score REAL");
  if (!cols.includes("item_match_method")) db.exec("ALTER TABLE poc_log_skill_evidence ADD COLUMN item_match_method TEXT");
}

function main() {
  const db = openDb();
  ensureColumns(db);

  const runRow = db.prepare("SELECT MAX(id) AS id FROM poc_runs WHERE run_type = 'log_evidence_extraction'").get() as any;
  const runId = runRow.id;

  const evidenceRows = db
    .prepare(
      `SELECT e.id, e.predicted_skill_id, e.predicted_item_name, s.supports_items
       FROM poc_log_skill_evidence e
       JOIN poc_taxonomy_skills s ON s.id = e.predicted_skill_id
       WHERE e.run_id = ?`
    )
    .all(runId) as any[];

  const itemsBySkill = new Map<string, { id: string; displayName: string }[]>();
  function itemsFor(skillId: string) {
    if (!itemsBySkill.has(skillId)) {
      const rows = db.prepare("SELECT id, display_name FROM poc_taxonomy_skill_items WHERE skill_id = ?").all(skillId) as any[];
      itemsBySkill.set(
        skillId,
        rows.map((r) => ({ id: r.id, displayName: r.display_name }))
      );
    }
    return itemsBySkill.get(skillId)!;
  }

  const update = db.prepare(
    "UPDATE poc_log_skill_evidence SET predicted_item_id = ?, item_match_score = ?, item_match_method = ? WHERE id = ?"
  );

  const counts = { not_applicable: 0, no_hint: 0, exact: 0, substring: 0, token_overlap: 0, levenshtein: 0, no_match: 0 };

  for (const row of evidenceRows) {
    if (!row.supports_items) {
      update.run(null, null, "not_applicable", row.id);
      counts.not_applicable += 1;
      continue;
    }
    if (!row.predicted_item_name) {
      update.run(null, null, "no_hint", row.id);
      counts.no_hint += 1;
      continue;
    }
    const candidates = itemsFor(row.predicted_skill_id);
    const result = matchItem(row.predicted_item_name, candidates);
    update.run(result.itemId, result.score, result.method, row.id);
    counts[result.method] += 1;
  }

  console.log(`Matched against run_id=${runId}, ${evidenceRows.length} evidence rows considered.`);
  console.log(JSON.stringify(counts, null, 2));
  db.close();
}

main();
