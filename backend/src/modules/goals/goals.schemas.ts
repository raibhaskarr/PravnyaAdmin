import { z } from "zod";

const goalItemSchema = z
  .object({
    canonicalSkillItemId: z.string().uuid().optional(),
    customText: z.string().min(1).max(300).optional()
  })
  .refine((item) => item.canonicalSkillItemId !== undefined || item.customText !== undefined, {
    message: "Each item needs either a canonicalSkillItemId or customText"
  });

export const createGoalSchema = z.object({
  kidId: z.string().uuid(),
  canonicalSkillId: z.string().uuid(),
  disciplineId: z.string().uuid(),
  modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"]),
  title: z.string().min(1).max(300),
  notes: z.string().max(4000).optional(),
  items: z.array(goalItemSchema).max(50).default([])
});

export const updateGoalSchema = z.object({
  canonicalSkillId: z.string().uuid().optional(),
  disciplineId: z.string().uuid().optional(),
  modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"]).optional(),
  title: z.string().min(1).max(300).optional(),
  status: z.enum(["ACTIVE", "ACHIEVED", "DISCONTINUED"]).optional(),
  notes: z.string().max(4000).nullable().optional(),
  items: z.array(goalItemSchema).max(50).optional()
});

export const goalParamsSchema = z.object({ goalId: z.string().uuid() });
export const goalQuerySchema = z.object({ kidId: z.string().uuid().optional() });

// A therapist logging a session picks an existing item, types a new one on the fly, or leaves both
// blank for "general practice, no specific item" -- the service finds-or-creates the right GoalItem
// either way, so the frontend never has to pre-create items before it can log against them.
export const createEvidenceSchema = z.object({
  goalItemId: z.string().uuid().optional(),
  newItemCustomText: z.string().min(1).max(300).optional(),
  logDate: z.string().min(1),
  centreName: z.string().max(200).nullable().optional(),
  outcome: z.enum(["CORRECT", "INCORRECT", "PARTIAL", "ATTEMPTED", "NOT_OBSERVED", "UNKNOWN"]),
  supportLevel: z.enum(["INDEPENDENT", "VISUAL_PROMPT", "VERBAL_PROMPT", "GESTURAL_PROMPT", "PHYSICAL_PROMPT", "PARTIAL_ASSISTANCE", "FULL_ASSISTANCE", "UNKNOWN"]),
  modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL", "UNKNOWN", "NOT_APPLICABLE"]).default("UNKNOWN"),
  measurementValue: z.number().nullable().optional(),
  measurementUnit: z.string().max(50).nullable().optional(),
  measurementBoolean: z.boolean().nullable().optional(),
  measurementText: z.string().max(500).nullable().optional()
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
