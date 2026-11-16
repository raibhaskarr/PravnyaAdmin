import { z } from "zod";

export const UPDATE_LANGUAGES = ["en", "hi"] as const;

export const listQuerySchema = z.object({ kidId: z.string().uuid() });
export const updateParamsSchema = z.object({ id: z.string().uuid() });

// The period is either a preset ("week" = the last 7 days, "month" = the last 30) or explicit dates.
export const createDraftSchema = z
  .object({
    kidId: z.string().uuid(),
    period: z.enum(["week", "month", "custom"]).default("week"),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    language: z.enum(UPDATE_LANGUAGES).default("en")
  })
  .refine((v) => v.period !== "custom" || (v.from && v.to && v.from <= v.to), "Custom periods need a from date on or before the to date");

export const editDraftSchema = z.object({ body: z.string().trim().min(1).max(5000) });

export const parentListParamsSchema = z.object({ kidId: z.string().uuid() });
export const parentUpdateParamsSchema = z.object({ kidId: z.string().uuid(), updateId: z.string().uuid() });
