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

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
