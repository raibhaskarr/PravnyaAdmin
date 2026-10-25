import { z } from "zod";

export const createCentreSchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().max(100).optional()
});

export type CreateCentreInput = z.infer<typeof createCentreSchema>;
