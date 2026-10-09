import { z } from "zod";

export const tenantProfileFieldsSchema = z.object({
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

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional()
});

// Superadmin: can also set KYC status/notes.
export const updateTenantProfileSchema = tenantProfileFieldsSchema.partial().merge(kycFieldsSchema.partial());

// Tenant admin, self-service: business fields only -- KYC approval is never the tenant's own call.
export const updateOwnTenantProfileSchema = tenantProfileFieldsSchema.partial();

export const tenantParamsSchema = z.object({
  tenantId: z.string().uuid()
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;
export type UpdateOwnTenantProfileInput = z.infer<typeof updateOwnTenantProfileSchema>;
