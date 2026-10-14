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
  // Free text, independent of the kid's own tenant -- doesn't need to match a real registered
  // Tenant (a goal can come from a clinic that isn't one), see the schema comment on Goal.
  centreName: z.string().max(200).optional(),
  items: z.array(goalItemSchema).max(50).default([])
});

export const updateGoalSchema = z.object({
  canonicalSkillId: z.string().uuid().optional(),
  disciplineId: z.string().uuid().optional(),
  modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"]).optional(),
  title: z.string().min(1).max(300).optional(),
  status: z.enum(["ACTIVE", "ACHIEVED", "DISCONTINUED"]).optional(),
  notes: z.string().max(4000).nullable().optional(),
  centreName: z.string().max(200).nullable().optional(),
  items: z.array(goalItemSchema).max(50).optional()
});

export const goalParamsSchema = z.object({ goalId: z.string().uuid() });
export const evidenceParamsSchema = z.object({ goalId: z.string().uuid(), evidenceId: z.string().uuid() });
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

// Narrow on purpose -- correcting which centre a logged session actually happened at is the one
// real need (see the Goal.centreName schema comment); the rest of an evidence row reflects what
// was actually observed at the time and isn't meant to be edited after the fact.
export const updateEvidenceSchema = z.object({
  centreName: z.string().max(200).nullable()
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
export type UpdateEvidenceInput = z.infer<typeof updateEvidenceSchema>;
