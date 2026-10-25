import { z } from "zod";

// Mirrors centres/centres.schemas.ts -- hand-duplicated, not imported, same parent/staff
// boundary convention every module pair in this codebase follows.
export const createCentreSchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().max(100).optional()
});

export type CreateCentreInput = z.infer<typeof createCentreSchema>;
