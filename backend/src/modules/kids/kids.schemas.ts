import { z } from "zod";

export const createKidSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dob: z.string().datetime().optional(),
  therapistIds: z.array(z.string().uuid()).default([])
});

export const updateKidSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dob: z.string().datetime().nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  therapistIds: z.array(z.string().uuid()).optional()
});

export const kidParamsSchema = z.object({ kidId: z.string().uuid() });

export type CreateKidInput = z.infer<typeof createKidSchema>;
export type UpdateKidInput = z.infer<typeof updateKidSchema>;
