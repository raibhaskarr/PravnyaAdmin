import { z } from "zod";

export const inviteTenantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  email: z.string().email()
});

export const invitationParamsSchema = z.object({ invitationId: z.string().uuid() });

export const tokenParamsSchema = z.object({ token: z.string().min(1) });

export const acceptTenantInvitationSchema = z.object({
  adminName: z.string().min(1).max(200),
  password: z.string().min(8).max(200)
});

export type InviteTenantInput = z.infer<typeof inviteTenantSchema>;
export type AcceptTenantInvitationInput = z.infer<typeof acceptTenantInvitationSchema>;
