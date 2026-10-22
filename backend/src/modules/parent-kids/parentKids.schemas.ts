import { z } from "zod";

export const createParentKidSchema = z.object({
  // Onboarding collects one "child's name" field, not first/last separately (matches the
  // one-decision-per-screen design) -- split into firstName/lastName in the service, not here.
  name: z.string().min(1).max(200),
  dob: z.string().datetime(),
  gender: z.string().min(1).max(60).optional()
});

// All optional, independently patchable -- onboarding's Therapies/Schedule screens and Home's
// nudge cards each call this for exactly one field at a time, never combined.
export const updateParentKidSchema = z
  .object({
    selfReportedTherapies: z.array(z.string().min(1).max(100)).max(20).optional(),
    selfReportedScheduleDays: z.array(z.string().min(1).max(20)).max(7).optional(),
    gender: z.string().min(1).max(60).optional()
  })
  .refine(
    (input) => input.selfReportedTherapies !== undefined || input.selfReportedScheduleDays !== undefined || input.gender !== undefined,
    { message: "At least one field is required" }
  );

export const parentKidParamsSchema = z.object({ kidId: z.string().uuid() });

export type CreateParentKidInput = z.infer<typeof createParentKidSchema>;
export type UpdateParentKidInput = z.infer<typeof updateParentKidSchema>;
