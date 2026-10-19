import { z } from "zod";

export const parentParamsSchema = z.object({ parentId: z.string().uuid() });

// Standalone creation, no kid attached ("Add parent" with no first kid) -- unlike
// kids.schemas.ts's createKidSchema, email and mobile are both required here, not conditionally
// required: there's no other reason to call this endpoint than to create a contactable parent
// record.
export const createParentSchema = z.object({
  parentEmail: z.string().email(),
  parentMobile: z.string().min(1).max(30),
  fatherName: z.string().min(1).max(200).optional(),
  motherName: z.string().min(1).max(200).optional(),
  addressLine1: z.string().min(1).max(300).optional(),
  city: z.string().min(1).max(120).optional()
});

export type CreateParentInput = z.infer<typeof createParentSchema>;
