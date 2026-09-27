import { z } from "zod";

export const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(200)
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional()
});

export const tenantParamsSchema = z.object({
  tenantId: z.string().uuid()
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
