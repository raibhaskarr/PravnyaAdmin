import { z } from "zod";

export const createTherapistSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  disciplineIds: z.array(z.string().uuid()).default([])
});

export const updateTherapistSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  disciplineIds: z.array(z.string().uuid()).optional()
});

export const therapistParamsSchema = z.object({ therapistId: z.string().uuid() });

export type CreateTherapistInput = z.infer<typeof createTherapistSchema>;
export type UpdateTherapistInput = z.infer<typeof updateTherapistSchema>;
