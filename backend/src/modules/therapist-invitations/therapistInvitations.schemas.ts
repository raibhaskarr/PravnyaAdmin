import { z } from "zod";

export const inviteGeneralSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30).optional(),
  disciplineIds: z.array(z.string().uuid()).default([])
});

export const inviteForKidSchema = z.object({
  email: z.string().email(),
  disciplineIds: z.array(z.string().uuid()).default([])
});

export const invitationParamsSchema = z.object({ invitationId: z.string().uuid() });

export const tokenParamsSchema = z.object({ token: z.string().min(1) });

export const acceptInvitationSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30).optional(),
  password: z.string().min(8).max(200)
});

export type InviteGeneralInput = z.infer<typeof inviteGeneralSchema>;
export type InviteForKidInput = z.infer<typeof inviteForKidSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
