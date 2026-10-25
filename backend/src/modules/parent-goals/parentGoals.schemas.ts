import { z } from "zod";

export const parentGoalListParamsSchema = z.object({ kidId: z.string().uuid() });
export const parentGoalEvidenceParamsSchema = z.object({ kidId: z.string().uuid(), goalId: z.string().uuid() });

// Same fields as the staff-facing createEvidenceSchema (goals.schemas.ts). centreId is optional,
// same environmentLabel null-means-Home convention Growth/Activities already rely on -- a parent
// can tag which centre or therapist suggested the activity (e.g. "my OT at Bright Steps told me to
// try this"), same Centre field the admin panel's own AI-assisted logging form now exposes too.
export const parentCreateEvidenceSchema = z.object({
  goalItemId: z.string().uuid().optional(),
  newItemCustomText: z.string().min(1).max(300).optional(),
  logDate: z.string().min(1),
  centreId: z.string().uuid().nullable().optional(),
  outcome: z.enum(["CORRECT", "INCORRECT", "PARTIAL", "ATTEMPTED", "NOT_OBSERVED", "UNKNOWN"]),
  supportLevel: z.enum(["INDEPENDENT", "VISUAL_PROMPT", "VERBAL_PROMPT", "GESTURAL_PROMPT", "PHYSICAL_PROMPT", "PARTIAL_ASSISTANCE", "FULL_ASSISTANCE", "UNKNOWN"]),
  modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL", "UNKNOWN", "NOT_APPLICABLE"]).default("UNKNOWN"),
  measurementValue: z.number().nullable().optional(),
  measurementUnit: z.string().max(50).nullable().optional(),
  measurementBoolean: z.boolean().nullable().optional(),
  measurementText: z.string().max(500).nullable().optional()
});

export type ParentCreateEvidenceInput = z.infer<typeof parentCreateEvidenceSchema>;

// Mirrors ai.routes.ts's extractEvidenceSchema, minus kidId (that comes from the URL param here,
// not the body).
export const parentExtractEvidenceSchema = z
  .object({
    freeText: z.string().min(1).max(8000).optional(),
    media: z
      .object({
        kind: z.enum(["image", "audio"]),
        mimeType: z.string().min(1).max(100),
        base64: z.string().min(1)
      })
      .optional()
  })
  .refine((v) => (v.freeText !== undefined) !== (v.media !== undefined), {
    message: "Provide exactly one of freeText or media"
  });

export type ParentExtractEvidenceInput = z.infer<typeof parentExtractEvidenceSchema>;
