import { z } from "zod";

export const parentTherapistKidParamsSchema = z.object({ kidId: z.string().uuid() });

export const parentTherapistInvitationParamsSchema = z.object({ kidId: z.string().uuid(), invitationId: z.string().uuid() });

export const parentUnlinkTherapistParamsSchema = z.object({ kidId: z.string().uuid(), therapistId: z.string().uuid() });

// Mirrors the admin's own inviteForKidSchema (therapist-invitations/therapistInvitations.schemas.ts)
// -- kept as its own definition, not imported, same convention as parentCreateEvidenceSchema vs
// createEvidenceSchema.
export const inviteTherapistSchema = z.object({
  email: z.string().email(),
  disciplineIds: z.array(z.string().uuid()).default([])
});

export type InviteTherapistInput = z.infer<typeof inviteTherapistSchema>;
