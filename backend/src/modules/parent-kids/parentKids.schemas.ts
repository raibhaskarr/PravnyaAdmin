import { z } from "zod";

export const createParentKidSchema = z.object({
  // Onboarding collects one "child's name" field, not first/last separately (matches the
  // one-decision-per-screen design) -- split into firstName/lastName in the service, not here.
  name: z.string().min(1).max(200),
  dob: z.string().datetime(),
  gender: z.string().min(1).max(60).optional()
});

export type CreateParentKidInput = z.infer<typeof createParentKidSchema>;
