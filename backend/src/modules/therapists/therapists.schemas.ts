import { z } from "zod";

export const updateTherapistSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().min(1).max(30).optional(),
  disciplineIds: z.array(z.string().uuid()).optional(),
  status: z.enum(["ACTIVE", "DEACTIVATED"]).optional()
});

export const setAssignedKidsSchema = z.object({
  kidIds: z.array(z.string().uuid())
});

// Self-service professional profile -- filled in by the therapist themselves, not the Tenant
// Admin (see Therapist.dob's schema comment). Deliberately a disjoint field set from
// updateTherapistSchema above: a therapist can't change their own name/phone/disciplineIds/status
// through this endpoint, only these.
export const updateOwnTherapistSchema = z.object({
  dob: z.string().datetime().nullable().optional(),
  gender: z.string().min(1).max(60).nullable().optional(),
  bio: z.string().max(4000).nullable().optional(),
  yearsOfExperience: z.number().int().min(0).max(80).nullable().optional(),
  qualifiedDisciplineIds: z.array(z.string().uuid()).optional()
});

export const therapistParamsSchema = z.object({ therapistId: z.string().uuid() });

export type UpdateTherapistInput = z.infer<typeof updateTherapistSchema>;
export type SetAssignedKidsInput = z.infer<typeof setAssignedKidsSchema>;
export type UpdateOwnTherapistInput = z.infer<typeof updateOwnTherapistSchema>;
