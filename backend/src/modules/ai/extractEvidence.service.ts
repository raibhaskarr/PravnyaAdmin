import { z } from "zod";
import { createExecutionContext } from "@pravnix/ai-core";
import type { AiContentPart } from "@pravnix/ai-core";
import { prisma } from "../../config/prisma";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { orchestrator } from "./ai.platform";

export interface EvidenceMedia {
  kind: "image" | "audio";
  mimeType: string;
  base64: string;
}

const OUTCOMES = ["CORRECT", "INCORRECT", "PARTIAL", "ATTEMPTED", "NOT_OBSERVED", "UNKNOWN"] as const;
const SUPPORT_LEVELS = ["INDEPENDENT", "VISUAL_PROMPT", "VERBAL_PROMPT", "GESTURAL_PROMPT", "PHYSICAL_PROMPT", "PARTIAL_ASSISTANCE", "FULL_ASSISTANCE", "UNKNOWN"] as const;
const MODALITIES = ["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL", "UNKNOWN", "NOT_APPLICABLE"] as const;

// Same measurement-type-aware extraction the L12 POC pipeline validated against real data, adapted
// to match against a specific kid's own real goals (a much smaller, already-curated list) instead
// of the full 148-skill taxonomy -- a free-text note only ever becomes evidence for a goal this kid
// actually has; anything else described in the note is simply not extracted (the therapist can log
// a new goal separately if something genuinely new comes up).
const SYSTEM_PROMPT =
  "You are helping a therapist turn a free-text session note into structured practice-evidence " +
  "entries against this specific kid's real, existing goals. A single note can contain evidence " +
  "for zero, one, or several different goals -- create ONE separate evidence entry per distinct " +
  "goal+item combination actually described. Only extract evidence for a goal that's in the " +
  "candidate list below; if the note describes something not covered by any of these goals, leave " +
  "it out entirely (the therapist can log a new goal separately, this pass never invents one).\n\n" +
  "For each piece of evidence found, extract: which candidate goal it's evidence for; itemHint -- " +
  "the ONE specific, concrete item/word/task actually involved (e.g. \"Apple\", \"Ball\", \"kick\"), " +
  "never a category (e.g. never \"fruits\"), null if the note only describes general practice with " +
  "no specific item named; the outcome; the support level the child needed; the modality the child " +
  "actually used to respond (verbal/manual_sign/aac/written/gestural/not_applicable/unknown -- infer " +
  "only from what the note actually says); a confidence score; and the exact excerpt of the note " +
  "that piece of evidence came from, so the therapist can see exactly what you based it on.\n\n" +
  "Each candidate goal is annotated with its measurement type in brackets, e.g. \"[measures: " +
  "frequency]\". Always fill outcome/supportLevel/modality regardless of type -- they're a " +
  "universal fallback. Additionally, based on the goal's declared type, fill exactly the matching " +
  "field(s) below when the note actually supports it (leave null rather than guessing a number " +
  "that isn't stated or clearly implied):\n" +
  "- [measures: trials] or no bracket: no extra fields -- outcome/supportLevel already cover it.\n" +
  "- [measures: frequency]: measurementValue = count of occurrences described (default 1 for a " +
  "single described instance), measurementUnit = \"times\".\n" +
  "- [measures: duration]: measurementValue = duration in seconds if stated or clearly implied " +
  "(e.g. \"5 minutes\" -> 300), measurementUnit = \"seconds\". Leave null if no duration is given.\n" +
  "- [measures: percentage]: measurementValue = 0-100 if a percentage or convertible fraction is " +
  "stated (e.g. \"4 out of 5\" -> 80). Leave null otherwise.\n" +
  "- [measures: prompt_level]: no extra fields -- supportLevel already covers it.\n" +
  "- [measures: yes_no]: measurementBoolean = true/false based on whether the note says the child " +
  "did or did not complete/achieve it.\n" +
  "- [measures: rating]: measurementValue = a 1-5 rating ONLY if the note gives an explicit or " +
  "clearly ordinal rating. Leave null if the note doesn't support picking a specific number.\n" +
  "- [measures: free_observation]: measurementText = a short (<=200 char) plain restatement of " +
  "what was actually observed, only when outcome/supportLevel genuinely don't capture it.\n\n" +
  "Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in " +
  'exactly this shape: {"hasEvidence": boolean, "evidence": [{"goalId": string, "itemHint": string ' +
  'or null, "outcome": one of ["CORRECT","INCORRECT","PARTIAL","ATTEMPTED","NOT_OBSERVED","UNKNOWN"], ' +
  '"supportLevel": one of ["INDEPENDENT","VISUAL_PROMPT","VERBAL_PROMPT","GESTURAL_PROMPT",' +
  '"PHYSICAL_PROMPT","PARTIAL_ASSISTANCE","FULL_ASSISTANCE","UNKNOWN"], "modality": one of ' +
  '["VERBAL","MANUAL_SIGN","AAC","WRITTEN","GESTURAL","UNKNOWN","NOT_APPLICABLE"], "measurementValue": ' +
  'number or null, "measurementUnit": string or null, "measurementBoolean": boolean or null, ' +
  '"measurementText": string or null, "confidence": number between 0 and 1, "excerpt": string}]}. ' +
  '"evidence" must be an empty array when hasEvidence is false. Up to 15 evidence items.';

function buildSchema(validGoalIds: Set<string>) {
  const evidenceItem = z.object({
    goalId: z.string().refine((id) => validGoalIds.has(id), { message: "Must be one of the provided candidate goal ids" }),
    itemHint: z.string().max(120).nullable(),
    outcome: z.enum(OUTCOMES),
    supportLevel: z.enum(SUPPORT_LEVELS),
    modality: z.enum(MODALITIES),
    measurementValue: z.number().nullable(),
    measurementUnit: z.string().max(20).nullable(),
    measurementBoolean: z.boolean().nullable(),
    measurementText: z.string().max(200).nullable(),
    confidence: z.number().min(0).max(1),
    excerpt: z.string().min(1).max(300)
  });
  return z
    .object({ hasEvidence: z.boolean(), evidence: z.array(evidenceItem).max(15) })
    .superRefine((value, ctx) => {
      if (!value.hasEvidence && value.evidence.length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "evidence must be empty when hasEvidence is false" });
      }
    });
}

export interface EvidenceCandidate {
  goalId: string;
  goalTitle: string;
  skillName: string;
  measurementType: "TRIALS" | "FREQUENCY" | "DURATION" | "PERCENTAGE" | "PROMPT_LEVEL" | "YES_NO" | "RATING" | "FREE_OBSERVATION" | null;
  itemHint: string | null;
  outcome: (typeof OUTCOMES)[number];
  supportLevel: (typeof SUPPORT_LEVELS)[number];
  modality: (typeof MODALITIES)[number];
  measurementValue: number | null;
  measurementUnit: string | null;
  measurementBoolean: boolean | null;
  measurementText: string | null;
  confidence: number;
  excerpt: string;
}

export const extractEvidenceService = {
  async extract(
    user: AuthUser,
    kidId: string,
    input: { freeText: string } | { media: EvidenceMedia }
  ): Promise<{ candidates: EvidenceCandidate[] } | { error: string }> {
    await assertCanAccessKid(user, kidId);

    const goals = await prisma.goal.findMany({
      where: { kidId, status: "ACTIVE" },
      select: { id: true, title: true, canonicalSkill: { select: { name: true, measurementType: true } } }
    });
    if (goals.length === 0) return { error: "This kid has no active goals to match against yet." };

    const validIds = new Set(goals.map((g) => g.id));
    const candidateLines = goals
      .map((g) => `${g.id}\t${g.title} (skill: ${g.canonicalSkill.name})${g.canonicalSkill.measurementType ? ` [measures: ${g.canonicalSkill.measurementType.toLowerCase()}]` : ""}`)
      .join("\n");

    const candidateBlock = `This kid's active goals (id, title (skill)):\n${candidateLines}`;
    const content: AiContentPart[] =
      "freeText" in input
        ? [{ type: "text", text: `Session note:\n${input.freeText}\n\n${candidateBlock}` }]
        : [
            {
              type: "text",
              text:
                (input.media.kind === "image"
                  ? "The attached image is a therapist's session note (handwritten or typed) -- read it and extract evidence from it exactly as you would a typed note."
                  : "The attached audio is a therapist describing a session out loud -- listen to it and extract evidence from it exactly as you would a typed note.") +
                `\n\n${candidateBlock}`
            },
            { type: input.media.kind, data: { base64: input.media.base64 }, mimeType: input.media.mimeType }
          ];

    // Claude's Messages API rejects audio input outright -- force Gemini for that case. Images
    // work on both, but Gemini is already the configured default when both keys are present isn't
    // guaranteed (Claude wins by default in ai.platform.ts), so leave image on the normal default.
    const forcedProvider = "media" in input && input.media.kind === "audio" ? "gemini" : undefined;

    const result = await orchestrator.executeStructured({
      name: "pravnyaadmin.extract-evidence-from-note",
      provider: forcedProvider,
      request: {
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId: user.tenantId ?? undefined, featureId: "extract-evidence-from-note" })
      },
      schema: buildSchema(validIds),
      maxRepairAttempts: 1
    });

    if (!result.success) return { error: "Couldn't review this note right now -- try again, or log it manually." };

    const goalById = new Map(goals.map((g) => [g.id, g]));
    const candidates: EvidenceCandidate[] = result.value.evidence.map((e) => {
      const goal = goalById.get(e.goalId)!;
      return { ...e, goalTitle: goal.title, skillName: goal.canonicalSkill.name, measurementType: goal.canonicalSkill.measurementType };
    });
    return { candidates };
  }
};
