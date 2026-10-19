import { z } from "zod";

// parentEmail here may find-or-CREATE a new parent (see kids.service.ts's create()), so mobile is
// required whenever it's given -- there's no point creating a parent record with no way to
// contact it. fatherName/motherName/addressLine1/city stay optional even then; they're often not
// all known at the moment of onboarding.
export const createKidSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    dob: z.string().datetime().optional(),
    therapistIds: z.array(z.string().uuid()).default([]),
    parentEmail: z.string().email().optional(),
    parentMobile: z.string().min(1).max(30).optional(),
    fatherName: z.string().min(1).max(200).optional(),
    motherName: z.string().min(1).max(200).optional(),
    addressLine1: z.string().min(1).max(300).optional(),
    city: z.string().min(1).max(120).optional()
  })
  .refine((input) => !input.parentEmail || !!input.parentMobile, {
    message: "Mobile number is required when a parent email is provided",
    path: ["parentMobile"]
  });

export const updateKidSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dob: z.string().datetime().nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  therapistIds: z.array(z.string().uuid()).optional(),
  // Links a kid to an ALREADY-EXISTING parent by email -- see kids.service.ts's update(). Unlike
  // createKidSchema's parentEmail, this never creates a new parent record, so there's nothing
  // else to collect here; an email with no matching parent is a 404, not a fallback creation.
  parentEmail: z.string().email().optional()
});

export const kidParamsSchema = z.object({ kidId: z.string().uuid() });

export type CreateKidInput = z.infer<typeof createKidSchema>;
export type UpdateKidInput = z.infer<typeof updateKidSchema>;
