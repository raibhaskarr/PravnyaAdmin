import { z } from "zod";

const tenantProfileFieldsSchema = z.object({
  leadOwnerName: z.string().min(1).max(200),
  leadOwnerEmail: z.string().email(),
  leadOwnerPhone: z.string().min(1).max(30),
  phone: z.string().min(1).max(30),
  website: z.string().url(),
  socialLinks: z.record(z.string().url()),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  pincode: z.string().min(1).max(20),
  logoUrl: z.string().url()
});

const kycFieldsSchema = z.object({
  kycStatus: z.enum(["PENDING", "VERIFIED", "REJECTED"]),
  kycNotes: z.string().max(2000)
});

export const createTenantSchema = z
  .object({
    name: z.string().min(1).max(200),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
    adminEmail: z.string().email(),
    adminName: z.string().min(1).max(200)
  })
  .merge(tenantProfileFieldsSchema.partial())
  .merge(kycFieldsSchema.partial());

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional()
});

export const updateTenantProfileSchema = tenantProfileFieldsSchema.partial().merge(kycFieldsSchema.partial());

export const tenantParamsSchema = z.object({
  tenantId: z.string().uuid()
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;
