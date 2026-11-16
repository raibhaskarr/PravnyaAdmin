import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);

/** One skill's at-home guide. The AI draft and staff edits are both checked against this. */
export const guideContentSchema = z.object({
  summary: text(400),
  minutes: z.number().int().min(2).max(20),
  materials: z.array(text(120)).max(6),
  steps: z.array(z.object({ title: text(80), detail: text(500) })).min(2).max(7),
  /** Least help first: what to try, in order, if the child doesn't manage on their own. */
  ifItsHard: z.array(text(300)).min(1).max(5),
  success: text(400),
  keepItFun: z.array(text(200)).max(4),
  stopIf: text(300)
});
export type GuideContent = z.infer<typeof guideContentSchema>;

export const walkthroughParamsSchema = z.object({ kidId: z.string().uuid(), goalId: z.string().uuid() });
export const skillParamsSchema = z.object({ skillId: z.string().uuid() });
export const saveGuideSchema = z.object({ content: guideContentSchema, reviewed: z.boolean() });
