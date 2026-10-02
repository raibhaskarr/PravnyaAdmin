import fs from "node:fs";
import path from "node:path";
import { openDb } from "../lib/db";

const DATA_DIR = path.join(__dirname, "..", "data");
const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));

function main() {
  const goals = readJson("iep_goals.decrypted.json") as Array<Record<string, unknown>>;
  const logs = readJson("daily_logs.decrypted.json") as Array<Record<string, unknown>>;
  const skills = readJson("taxonomy_skills.json") as Array<Record<string, unknown>>;
  const items = readJson("taxonomy_items.json") as Array<Record<string, unknown>>;

  const db = openDb();
  db.exec(
    "DELETE FROM poc_taxonomy_skill_items; DELETE FROM poc_taxonomy_skills; DELETE FROM poc_source_logs; DELETE FROM poc_source_goals;"
  );

  const insGoal = db.prepare(
    `INSERT INTO poc_source_goals (id, child_id, domain_name, category, title, description, target_behavior, measurement_method, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const g of goals) {
    insGoal.run(
      g.id as string,
      g.childId as string,
      (g.domainName as string) ?? null,
      (g.category as string) ?? null,
      g.title as string,
      (g.description as string) ?? null,
      (g.targetBehavior as string) ?? null,
      (g.measurementMethod as string) ?? null,
      (g.status as string) ?? null
    );
  }

  const insLog = db.prepare(
    `INSERT INTO poc_source_logs (id, child_id, log_date, category, source, free_text, linked_iep_goal_id, capture_intent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const l of logs) {
    insLog.run(
      l.id as string,
      l.childId as string,
      (l.logDate as string) ?? null,
      (l.category as string) ?? null,
      (l.source as string) ?? null,
      l.freeText as string,
      (l.linkedIepGoalId as string) ?? null,
      (l.captureIntent as string) ?? null
    );
  }

  const insSkill = db.prepare(
    `INSERT INTO poc_taxonomy_skills (id, key, name, domain_name, default_discipline_name, supports_items, supported_modalities)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const s of skills) {
    insSkill.run(
      s.id as string,
      s.key as string,
      s.name as string,
      s.domain_name as string,
      (s.default_discipline_name as string) ?? null,
      s.supportsItems ? 1 : 0,
      JSON.stringify(s.supportedModalities ?? [])
    );
  }

  const insItem = db.prepare(
    `INSERT INTO poc_taxonomy_skill_items (id, skill_id, key, display_name, semantic_group) VALUES (?, ?, ?, ?, ?)`
  );
  for (const i of items) {
    insItem.run(i.id as string, i.skillId as string, i.key as string, i.displayName as string, (i.semanticGroup as string) ?? null);
  }

  console.log(`Loaded: ${goals.length} goals, ${logs.length} logs, ${skills.length} skills, ${items.length} items.`);
  db.close();
}

main();
