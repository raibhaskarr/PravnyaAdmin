import { z } from "zod";
import { createExecutionContext, textMessage } from "@pravnix/ai-core";
import { Modality } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthUser } from "../../common/middleware/auth";
import { orchestrator } from "./ai.platform";

const SYSTEM_PROMPT =
  "You are helping a pediatric therapy admin system match a free-text goal title, as written by a " +
  "therapist (often copied straight from an IEP), to the single best-matching entry in a shared " +
  "clinical skill taxonomy. Pick exactly one canonicalSkillId from the candidate list provided. " +
  "Give a one-sentence rationale in plain language a therapist would understand. If nothing is a " +
  "close match, still pick the closest one -- never invent an id that isn't in the candidate list.";

export interface SkillNameCandidate {
  id: string;
  name: string;
  domainName: string;
}

function buildSuggestionSchema(validIds: Set<string>) {
  return z.object({
    canonicalSkillId: z.string().refine((id) => validIds.has(id), {
      message: "Must be one of the provided candidate skill ids"
    }),
    rationale: z.string().min(1).max(300)
  });
}

export type PickCandidateResult = { success: true; canonicalSkillId: string; rationale: string } | { success: false };

type Orchestrator = Pick<typeof orchestrator, "executeStructured">;

/**
 * The only step that calls the AI. Kept separate from the DB-touching `suggest()` below so it can
 * be unit-tested directly against the fake provider without a database -- `orchestratorOverride`
 * exists purely for that; production code always uses the default (the real, env-wired singleton).
 * Never trusts the model's chosen id blindly -- the schema itself rejects anything outside the
 * candidate set.
 */
export async function pickCandidateSkill(
  title: string,
  candidates: SkillNameCandidate[],
  orchestratorOverride: Orchestrator = orchestrator
): Promise<PickCandidateResult> {
  if (candidates.length === 0) return { success: false };

  const validIds = new Set(candidates.map((c) => c.id));
  const candidateLines = candidates.map((c) => `${c.id}\t${c.domainName} > ${c.name}`).join("\n");

  const result = await orchestratorOverride.executeStructured({
    name: "pravnyaadmin.goal-skill-suggestion",
    request: {
      systemPrompt: SYSTEM_PROMPT,
      messages: [textMessage("user", `Goal title: "${title}"\n\nCandidate skills (id, domain > name):\n${candidateLines}`)],
      executionContext: createExecutionContext({ productId: "pravnyaadmin", featureId: "goal-skill-suggestion" })
    },
    schema: buildSuggestionSchema(validIds),
    maxRepairAttempts: 1
  });

  if (!result.success) return { success: false };
  return { success: true, canonicalSkillId: result.value.canonicalSkillId, rationale: result.value.rationale };
}

/**
 * Discipline and modality are never asked of the AI -- they're derived from the chosen skill's own
 * "default, not exclusive" tagging (see 03-business-logic.md), narrowed to what this tenant
 * actually has enabled. This keeps the model's job to exactly one constrained choice, which is
 * what the schema can actually validate against a candidate set.
 */
export function deriveDisciplineAndModality(
  skill: { defaultDisciplineId: string | null; supportedModalities: Modality[] },
  tenantEnabledDisciplineIds: string[]
): { disciplineId: string | null; modality: Modality | null } {
  const enabled = new Set(tenantEnabledDisciplineIds);
  const disciplineId =
    skill.defaultDisciplineId && enabled.has(skill.defaultDisciplineId)
      ? skill.defaultDisciplineId
      : (tenantEnabledDisciplineIds[0] ?? null);
  const modality = skill.supportedModalities[0] ?? null;
  return { disciplineId, modality };
}

export interface GoalSkillSuggestion {
  domainId: string;
  canonicalSkillId: string;
  disciplineId: string | null;
  modality: Modality | null;
  rationale: string;
}

export interface SuggestionOutcome {
  suggestion: GoalSkillSuggestion | null;
  reason?: string;
}

const NO_SUGGESTION_REASON = "Couldn't generate a suggestion right now -- pick manually below.";

export const goalSkillSuggestionService = {
  async suggest(user: AuthUser, title: string): Promise<SuggestionOutcome> {
    const skills = await prisma.canonicalSkill.findMany({
      select: {
        id: true,
        name: true,
        domainId: true,
        defaultDisciplineId: true,
        supportedModalities: true,
        domain: { select: { name: true } }
      }
    });

    if (skills.length === 0) {
      return { suggestion: null, reason: "No canonical skills exist yet." };
    }

    const picked = await pickCandidateSkill(
      title,
      skills.map((s) => ({ id: s.id, name: s.name, domainName: s.domain.name }))
    );

    if (!picked.success) {
      return { suggestion: null, reason: NO_SUGGESTION_REASON };
    }

    const skill = skills.find((s) => s.id === picked.canonicalSkillId);
    if (!skill) {
      return { suggestion: null, reason: NO_SUGGESTION_REASON };
    }

    const tenantDisciplines = await prisma.tenantDiscipline.findMany({
      where: { tenantId: user.tenantId! },
      select: { disciplineId: true },
      orderBy: { createdAt: "asc" }
    });

    const { disciplineId, modality } = deriveDisciplineAndModality(
      skill,
      tenantDisciplines.map((d) => d.disciplineId)
    );

    return {
      suggestion: {
        domainId: skill.domainId,
        canonicalSkillId: skill.id,
        disciplineId,
        modality,
        rationale: picked.rationale
      }
    };
  }
};
