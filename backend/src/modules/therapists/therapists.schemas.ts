import { z } from "zod";

export const updateTherapistSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().min(1).max(30).optional(),
  disciplineIds: z.array(z.string().uuid()).optional()
});

export const therapistParamsSchema = z.object({ therapistId: z.string().uuid() });

export type UpdateTherapistInput = z.infer<typeof updateTherapistSchema>;
