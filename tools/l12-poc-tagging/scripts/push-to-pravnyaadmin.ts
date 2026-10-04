// One-off import: pushes the real POC results from poc.sqlite into PravnyaAdmin's production
// /api/poc-review/import endpoint. Never reads or sends excerpt/source-text -- only derived,
// structured fields, per the explicit scope decision for this page.
//
// Pushes one import per (child, provider) pair -- each provider's latest goal_tagging and
// log_evidence_extraction runs are selected independently, so a Gemini pass and a Claude pass
// over the same children coexist side-by-side (the backend scopes its replace-on-import wipe to
// childId+modelProvider, not just childId).
import "dotenv/config";
import { openDb } from "../lib/db";

const API_BASE = "https://admin.pravnya.com/api";

const CHILDREN: { label: string; sourceChildId: string }[] = [
  { label: "Ananya", sourceChildId: "a567e2ee-f3b1-489a-b568-f36a028f6e74" },
  { label: "Pranava", sourceChildId: "24fe2e79-7b7d-45d2-ae47-e49b179033ea" }
];

const PROVIDERS = ["gemini", "claude"] as const;
const MODEL_NAME_BY_PROVIDER: Record<string, string> = { gemini: "gemini-3.8-flash", claude: "claude-sonnet-5" };

async function login(): Promise<string> {
  const email = process.env.PRAVNYAADMIN_EMAIL;
  const password = process.env.PRAVNYAADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set PRAVNYAADMIN_EMAIL and PRAVNYAADMIN_PASSWORD in .env");
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

function mapGoalStatus(s: string): "TAGGED" | "NO_MATCH" | "ERROR" {
  return s === "tagged" ? "TAGGED" : s === "no_match" ? "NO_MATCH" : "ERROR";
}

function mapOutcome(s: string): string {
  return s.toUpperCase();
}

function mapSupport(s: string): string {
  return s.toUpperCase();
}

function mapModality(s: string | null): string {
  return s ? s.toUpperCase() : "UNKNOWN";
}

function mapMeasurementType(s: string | null): string | null {
  return s ? s.toUpperCase() : null;
}

async function main() {
  const db = openDb();
  const token = await login();

  for (const child of CHILDREN) {
    for (const provider of PROVIDERS) {
      // completed_at IS NOT NULL excludes an in-progress or crashed-mid-run run (e.g. a batch killed
      // by a concurrent-writer lock error) -- otherwise MAX(id) alone would pick a partial run over
      // the last good complete one and push broken data live.
      const latestGoalRun = db
        .prepare(`SELECT id FROM poc_runs WHERE run_type = 'goal_tagging' AND model_provider = ? AND completed_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
        .get(provider) as { id: number } | undefined;
      const latestEvidenceRun = db
        .prepare(`SELECT id FROM poc_runs WHERE run_type = 'log_evidence_extraction' AND model_provider = ? AND completed_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
        .get(provider) as { id: number } | undefined;

      if (!latestGoalRun && !latestEvidenceRun) {
        console.log(`${child.label} (${provider}): no runs found, skipping.`);
        continue;
      }

      const goalRows = latestGoalRun
        ? (db
            .prepare(
              `SELECT t.*, g.title AS goal_title, g.domain_name AS source_domain_name, g.category AS source_category, g.centre_name AS source_centre_name
               FROM poc_goal_skill_tags t
               JOIN poc_source_goals g ON g.id = t.source_goal_id
               WHERE t.child_id = ? AND t.run_id = ?`
            )
            .all(child.sourceChildId, latestGoalRun.id) as any[])
        : [];

      const evidenceRows = latestEvidenceRun
        ? (db
            .prepare(
              `SELECT e.*, l.log_date AS source_log_date, l.centre_name AS source_centre_name
               FROM poc_log_skill_evidence e
               JOIN poc_source_logs l ON l.id = e.source_log_id
               WHERE e.child_id = ? AND e.run_id = ?`
            )
            .all(child.sourceChildId, latestEvidenceRun.id) as any[])
        : [];

      const modelName = MODEL_NAME_BY_PROVIDER[provider] ?? "unknown";

      const payload = {
        label: child.label,
        sourceChildId: child.sourceChildId,
        modelProvider: provider,
        modelName,
        goalTags: goalRows.map((r) => ({
          sourceGoalId: r.source_goal_id,
          goalTitle: r.goal_title,
          originalDomainName: r.source_domain_name,
          originalCategory: r.source_category,
          centreName: r.source_centre_name,
          predictedSkillId: r.predicted_skill_id,
          confidence: r.confidence,
          rationale: r.rationale,
          status: mapGoalStatus(r.status)
        })),
        logEvidence: evidenceRows.map((r) => ({
          logDate: r.source_log_date,
          centreName: r.source_centre_name,
          predictedSkillId: r.predicted_skill_id,
          itemHint: r.predicted_item_name,
          predictedItemId: r.item_match_method === "ai" ? r.predicted_item_id : null,
          itemMatchScore: r.item_match_score,
          itemMatchMethod: r.item_match_method,
          outcome: mapOutcome(r.outcome),
          supportLevel: mapSupport(r.support_level),
          modality: mapModality(r.modality),
          measurementType: mapMeasurementType(r.measurement_type),
          measurementNumerator: null,
          measurementDenominator: null,
          measurementValue: r.measurement_value,
          measurementUnit: r.measurement_unit,
          measurementBoolean: r.measurement_boolean === null ? null : Boolean(r.measurement_boolean),
          measurementText: r.measurement_text,
          confidence: r.confidence
        }))
      };

      const res = await fetch(`${API_BASE}/poc-review/import`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      console.log(`${child.label} (${provider}): HTTP ${res.status} ${text}`);
    }
  }

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
