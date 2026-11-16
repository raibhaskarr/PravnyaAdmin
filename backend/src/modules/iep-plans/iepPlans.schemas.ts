import { z } from "zod";

export const listQuerySchema = z.object({ kidId: z.string().uuid() });
export const planParamsSchema = z.object({ id: z.string().uuid() });

const line = z.string().trim().min(1).max(300);

export const planGoalSchema = z.object({
  goalId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  area: z.string().max(120),
  baseline: z.string().trim().max(600),
  target: z.string().trim().max(600),
  strategies: z.array(line).max(6),
  homePractice: z.array(line).max(4)
});

export const planContentSchema = z.object({
  presentLevels: z.string().trim().max(3000),
  strengths: z.array(line).max(8),
  goals: z.array(planGoalSchema).max(40),
  notes: z.string().trim().max(2000)
});
export type PlanContent = z.infer<typeof planContentSchema>;
export type PlanGoal = z.infer<typeof planGoalSchema>;

// The baseline is read from the last 30 or 90 days of logs; the review is due on reviewDate
// (three months from today when not given).
export const createPlanSchema = z.object({
  kidId: z.string().uuid(),
  baselineDays: z.union([z.literal(30), z.literal(90)]).default(90),
  reviewDate: z.coerce.date().optional(),
  title: z.string().trim().min(1).max(200).optional()
});

export const editPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    reviewDate: z.coerce.date().optional(),
    content: planContentSchema.optional()
  })
  .refine((v) => v.title !== undefined || v.reviewDate !== undefined || v.content !== undefined, "Nothing to change");

export const parentListParamsSchema = z.object({ kidId: z.string().uuid() });
export const parentPlanParamsSchema = z.object({ kidId: z.string().uuid(), planId: z.string().uuid() });
