import { z } from "zod";

export const parentGoalListParamsSchema = z.object({ kidId: z.string().uuid() });
export const parentGoalEvidenceParamsSchema = z.object({ kidId: z.string().uuid(), goalId: z.string().uuid() });

// Same fields as the staff-facing createEvidenceSchema (goals.schemas.ts), minus centreName --
// a parent logging their own observation is inherently a Home entry (environmentLabel's
// centreName-null-means-Home convention, same one Growth/Activities already rely on). The service
// forces centreName: null rather than trusting an absent field, so there's no way to spoof a
// centre through this endpoint even if the schema were ever loosened later.
export const parentCreateEvidenceSchema = z.object({
  goalItemId: z.string().uuid().optional(),
  newItemCustomText: z.string().min(1).max(300).optional(),
  logDate: z.string().min(1),
  outcome: z.enum(["CORRECT", "INCORRECT", "PARTIAL", "ATTEMPTED", "NOT_OBSERVED", "UNKNOWN"]),
  supportLevel: z.enum(["INDEPENDENT", "VISUAL_PROMPT", "VERBAL_PROMPT", "GESTURAL_PROMPT", "PHYSICAL_PROMPT", "PARTIAL_ASSISTANCE", "FULL_ASSISTANCE", "UNKNOWN"]),
  modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL", "UNKNOWN", "NOT_APPLICABLE"]).default("UNKNOWN"),
  measurementValue: z.number().nullable().optional(),
  measurementUnit: z.string().max(50).nullable().optional(),
  measurementBoolean: z.boolean().nullable().optional(),
  measurementText: z.string().max(500).nullable().optional()
});

export type ParentCreateEvidenceInput = z.infer<typeof parentCreateEvidenceSchema>;
