import { z } from "zod";

// Shared between extractEvidence.service.ts (a free-text note -> evidence against a kid's own
// goals) and iepExtraction.service.ts (an IEP document -> status updates against a kid's own
// goals, alongside new-goal extraction) -- same evidence shape, same measurement-type-aware field
// rules, so a status update extracted from an IEP saves through the exact same
// POST /goals/:goalId/evidence endpoint a manually logged note would.
export const OUTCOMES = ["CORRECT", "INCORRECT", "PARTIAL", "ATTEMPTED", "NOT_OBSERVED", "UNKNOWN"] as const;
export const SUPPORT_LEVELS = ["INDEPENDENT", "VISUAL_PROMPT", "VERBAL_PROMPT", "GESTURAL_PROMPT", "PHYSICAL_PROMPT", "PARTIAL_ASSISTANCE", "FULL_ASSISTANCE", "UNKNOWN"] as const;
export const MODALITIES = ["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL", "UNKNOWN", "NOT_APPLICABLE"] as const;

// The measurement-type-conditional field-filling rules, shared verbatim by both prompts.
export const EVIDENCE_FIELD_INSTRUCTIONS =
  "Each candidate goal is annotated with its measurement type in brackets, e.g. \"[measures: " +
  "frequency]\". Always fill outcome/supportLevel/modality regardless of type -- they're a " +
  "universal fallback. Additionally, based on the goal's declared type, fill exactly the matching " +
  "field(s) below when the source actually supports it (leave null rather than guessing a number " +
  "that isn't stated or clearly implied):\n" +
  "- [measures: trials] or no bracket: no extra fields -- outcome/supportLevel already cover it.\n" +
  "- [measures: frequency]: measurementValue = count of occurrences described (default 1 for a " +
  "single described instance), measurementUnit = \"times\".\n" +
  "- [measures: duration]: measurementValue = duration in seconds if stated or clearly implied " +
  "(e.g. \"5 minutes\" -> 300), measurementUnit = \"seconds\". Leave null if no duration is given.\n" +
  "- [measures: percentage]: measurementValue = 0-100 if a percentage or convertible fraction is " +
  "stated (e.g. \"4 out of 5\" -> 80). Leave null otherwise.\n" +
  "- [measures: prompt_level]: no extra fields -- supportLevel already covers it.\n" +
  "- [measures: yes_no]: measurementBoolean = true/false based on whether the source says the " +
  "child did or did not complete/achieve it.\n" +
  "- [measures: rating]: measurementValue = a 1-5 rating ONLY if the source gives an explicit or " +
  "clearly ordinal rating. Leave null if the source doesn't support picking a specific number.\n" +
  "- [measures: free_observation]: measurementText = a short (<=200 char) plain restatement of " +
  "what was actually observed, only when outcome/supportLevel genuinely don't capture it.";

export function evidenceItemSchema(validGoalIds: Set<string>) {
  return z.object({
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
}

export interface EvidenceCandidate {
  goalId: string;
  goalTitle: string;
  skillName: string;
  domainName: string;
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
