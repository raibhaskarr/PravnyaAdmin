import { z } from "zod";

export const createGoalSchema = z.object({
  kidId: z.string().uuid(),
  canonicalSkillId: z.string().uuid(),
  disciplineId: z.string().uuid(),
  modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"]),
  title: z.string().min(1).max(300),
  notes: z.string().max(4000).optional()
});

export const updateGoalSchema = z.object({
  canonicalSkillId: z.string().uuid().optional(),
  disciplineId: z.string().uuid().optional(),
  modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"]).optional(),
  title: z.string().min(1).max(300).optional(),
  status: z.enum(["ACTIVE", "ACHIEVED", "DISCONTINUED"]).optional(),
  notes: z.string().max(4000).nullable().optional()
});

export const goalParamsSchema = z.object({ goalId: z.string().uuid() });
export const goalQuerySchema = z.object({ kidId: z.string().uuid().optional() });

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
