// Reverse-direction pass: for each skill that has log evidence but no goal tagged to it (from
// either provider), search the child's full real goal list for a plausible fit -- looser than the
// original goal-tagging pass, which requires one specific goal to pick one specific skill.
//
// Deliberately reads NOTHING from PranTrackingSystem directly. Every input here is already derived,
// non-clinical-text data already live in PravnyaAdmin: the real goal list is recovered as the union
// of every PocGoalTag row across both providers (TAGGED and NO_MATCH both carry the real
// goalTitle/originalDomainName/originalCategory regardless of what skill, if any, they matched), and
// skill context comes from the itemHint strings already pushed with each evidence row -- never the
// raw log excerpt, which this POC's privacy boundary keeps local-only and this script never touches.
import "dotenv/config";
import { z } from "zod";
import { textMessage, createExecutionContext } from "@pravnix/ai-core";
import { orchestrator, ACTIVE_PROVIDER } from "../lib/aiPlatform";

const API_BASE = "https://admin.pravnya.com/api";
const MODEL_NAME_BY_PROVIDER: Record<string, string> = { gemini: "gemini-3.8-flash", claude: "claude-sonnet-5" };

const CHILDREN: { label: string; id: string }[] = [
  { label: "Ananya", id: "004f0b7b-ab7d-47b8-941c-93f167f6d710" },
  { label: "Pranava", id: "15edc67f-3034-47e5-9c84-c07671af30fa" }
];

const SYSTEM_PROMPT =
  "You are helping review a clinical skill taxonomy against a specific child's real therapy goals. " +
  "You'll be given one Canonical Skill that has real daily-log evidence but was never matched to any " +
  "of this child's goals by the normal goal-to-skill tagging pass, plus the full list of this " +
  "child's real goals (title, domain, category). Your job: search the WHOLE goal list and decide " +
  "whether any single goal plausibly covers this skill, even if the fit is loose or the goal's " +
  "title doesn't obviously mention it -- e.g. a goal titled \"OT - gross motor activities\" can " +
  "plausibly cover a skill like \"Jumps\" or \"Balances\" even without naming them. Only pick a goal " +
  "if there's a real, defensible connection; say there's no match rather than forcing a weak one. " +
  "This is a product-evidence categorization aid for a human reviewer to confirm or reject, not a " +
  "clinical or diagnostic judgment. Never invent a goalId that isn't in the candidate list.\n\n" +
  "Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in " +
  'exactly this shape: {"hasMatch": boolean, "goalId": string or null, "confidence": number between ' +
  '0 and 1, "rationale": string}. goalId must be null when hasMatch is false, and must be exactly ' +
  "one of the candidate goal ids when hasMatch is true.";

interface RealGoal {
  sourceGoalId: string;
  goalTitle: string;
  originalDomainName: string | null;
  originalCategory: string | null;
}

interface SkillRef {
  id: string;
  name: string;
  domain: { name: string };
}

interface UnmatchedSkill {
  canonicalSkillId: string;
  skill: SkillRef | null;
  itemHints: string[];
}

function buildSchema(validGoalIds: Set<string>) {
  return z
    .object({
      hasMatch: z.boolean(),
      goalId: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      rationale: z.string().min(1).max(400)
    })
    .superRefine((value, ctx) => {
      if (value.hasMatch && (!value.goalId || !validGoalIds.has(value.goalId))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "goalId must be one of the candidate ids when hasMatch is true" });
      }
      if (!value.hasMatch && value.goalId !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "goalId must be null when hasMatch is false" });
      }
    });
}

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

async function matchOne(skill: UnmatchedSkill, goals: RealGoal[]) {
  const validGoalIds = new Set(goals.map((g) => g.sourceGoalId));
  const goalLines = goals
    .map((g) => `${g.sourceGoalId}\t${g.goalTitle}${g.originalDomainName ? ` [${g.originalDomainName}${g.originalCategory ? `/${g.originalCategory}` : ""}]` : ""}`)
    .join("\n");
  const hintsLine = skill.itemHints.length ? `Items/content seen in this skill's evidence: ${skill.itemHints.join(", ")}` : "No specific items recorded for this skill's evidence.";

  return orchestrator.executeStructured({
    name: "poc.match-evidence-to-goal",
    request: {
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        textMessage(
          "user",
          `Skill with unmatched evidence: ${skill.skill?.name} (domain: ${skill.skill?.domain.name})\n${hintsLine}\n\nThis child's real goals (id, title [domain/category]):\n${goalLines}`
        )
      ],
      executionContext: createExecutionContext({ productId: "l12-poc", featureId: "match-evidence-to-goal" })
    },
    schema: buildSchema(validGoalIds),
    maxRepairAttempts: 1
  });
}

async function main() {
  const token = await login();
  const modelName = MODEL_NAME_BY_PROVIDER[ACTIVE_PROVIDER] ?? "unknown";

  for (const child of CHILDREN) {
    console.log(`\n=== ${child.label} ===`);
    const detailRes = await fetch(`${API_BASE}/poc-review/children/${child.id}`, { headers: { authorization: `Bearer ${token}` } });
    const detail = (await detailRes.json()) as {
      sourceChildId: string;
      goalTags: { sourceGoalId: string | null; goalTitle: string; originalDomainName: string | null; originalCategory: string | null; predictedSkill: SkillRef | null; status: string }[];
      logEvidence: { predictedSkill: SkillRef | null; itemHint: string | null }[];
    };

    const goalsById = new Map<string, RealGoal>();
    for (const g of detail.goalTags) {
      if (!g.sourceGoalId || goalsById.has(g.sourceGoalId)) continue;
      goalsById.set(g.sourceGoalId, { sourceGoalId: g.sourceGoalId, goalTitle: g.goalTitle, originalDomainName: g.originalDomainName, originalCategory: g.originalCategory });
    }
    const goals = [...goalsById.values()];
    console.log(`${goals.length} real goals recovered from PocGoalTag rows.`);

    const flagsRes = await fetch(`${API_BASE}/poc-review/children/${child.id}/review-flags`, { headers: { authorization: `Bearer ${token}` } });
    const flags = (await flagsRes.json()) as { evidenceWithoutGoal: { canonicalSkillId: string; skill: SkillRef | null }[] };

    const itemHintsBySkill = new Map<string, Set<string>>();
    for (const e of detail.logEvidence) {
      if (!e.predictedSkill || !e.itemHint) continue;
      const set = itemHintsBySkill.get(e.predictedSkill.id) ?? new Set<string>();
      if (set.size < 15) set.add(e.itemHint);
      itemHintsBySkill.set(e.predictedSkill.id, set);
    }

    const targets: UnmatchedSkill[] = flags.evidenceWithoutGoal.map((f) => ({
      canonicalSkillId: f.canonicalSkillId,
      skill: f.skill,
      itemHints: [...(itemHintsBySkill.get(f.canonicalSkillId) ?? [])]
    }));
    console.log(`${targets.length} unmatched skills to search against the goal list, provider=${ACTIVE_PROVIDER}...`);

    const suggestions: { canonicalSkillId: string; suggestedGoalId: string | null; suggestedGoalTitle: string | null; confidence: number | null; rationale: string | null }[] = [];
    let i = 0;
    for (const target of targets) {
      i += 1;
      const result = await matchOne(target, goals);
      if (!result.success) {
        console.log(`  [${i}/${targets.length}] ${target.skill?.name}: AI error, skipping`);
        continue;
      }
      const matchedGoal = result.value.goalId ? goalsById.get(result.value.goalId) ?? null : null;
      suggestions.push({
        canonicalSkillId: target.canonicalSkillId,
        suggestedGoalId: result.value.goalId,
        suggestedGoalTitle: matchedGoal?.goalTitle ?? null,
        confidence: result.value.confidence,
        rationale: result.value.rationale
      });
      console.log(`  [${i}/${targets.length}] ${target.skill?.name}: ${matchedGoal ? `-> "${matchedGoal.goalTitle}" (${Math.round(result.value.confidence * 100)}%)` : "no match"}`);
    }

    const importRes = await fetch(`${API_BASE}/poc-review/evidence-goal-suggestions/import`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ sourceChildId: detail.sourceChildId, modelProvider: ACTIVE_PROVIDER, modelName, suggestions })
    });
    console.log(`Pushed: HTTP ${importRes.status} ${await importRes.text()}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
