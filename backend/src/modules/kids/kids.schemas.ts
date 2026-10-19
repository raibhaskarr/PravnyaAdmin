import { z } from "zod";

// Shared by createKidSchema (onboarding) and updateKidSchema (linking a parent to a kid that was
// added without one). Parent info is optional at the schema level either way, but mobile is
// required WHENEVER parentEmail is given -- there's no point creating a parent record with no way
// to contact it. fatherName/motherName/addressLine1/city stay optional even then; they're often
// not all known at the moment of onboarding.
const parentFields = {
  parentEmail: z.string().email().optional(),
  parentMobile: z.string().min(1).max(30).optional(),
  fatherName: z.string().min(1).max(200).optional(),
  motherName: z.string().min(1).max(200).optional(),
  addressLine1: z.string().min(1).max(300).optional(),
  city: z.string().min(1).max(120).optional()
};

function requireMobileWithEmail(input: { parentEmail?: string; parentMobile?: string }) {
  return !input.parentEmail || !!input.parentMobile;
}

export const createKidSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    dob: z.string().datetime().optional(),
    therapistIds: z.array(z.string().uuid()).default([]),
    ...parentFields
  })
  .refine(requireMobileWithEmail, {
    message: "Mobile number is required when a parent email is provided",
    path: ["parentMobile"]
  });

export const updateKidSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    dob: z.string().datetime().nullable().optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    therapistIds: z.array(z.string().uuid()).optional(),
    ...parentFields
  })
  .refine(requireMobileWithEmail, {
    message: "Mobile number is required when a parent email is provided",
    path: ["parentMobile"]
  });

export const kidParamsSchema = z.object({ kidId: z.string().uuid() });

export type CreateKidInput = z.infer<typeof createKidSchema>;
export type UpdateKidInput = z.infer<typeof updateKidSchema>;
