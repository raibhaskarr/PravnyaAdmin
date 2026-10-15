import { z } from "zod";

export const inviteSuperadminSchema = z.object({
  email: z.string().email()
});

export const invitationParamsSchema = z.object({ invitationId: z.string().uuid() });

export const tokenParamsSchema = z.object({ token: z.string().min(1) });

export const acceptSuperadminInvitationSchema = z.object({
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200)
});

export type InviteSuperadminInput = z.infer<typeof inviteSuperadminSchema>;
export type AcceptSuperadminInvitationInput = z.infer<typeof acceptSuperadminInvitationSchema>;
