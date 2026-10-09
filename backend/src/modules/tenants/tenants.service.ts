import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { UpdateTenantInput, UpdateTenantProfileInput, UpdateOwnTenantProfileInput } from "./tenants.schemas";

const PROFILE_FIELD_KEYS = [
  "leadOwnerName",
  "leadOwnerEmail",
  "leadOwnerPhone",
  "phone",
  "website",
  "socialLinks",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "country",
  "pincode",
  "logoUrl",
  "kycStatus",
  "kycNotes"
] as const;

export const tenantsService = {
  list() {
    return prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
  },

  async get(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw notFound("Tenant not found");
    return tenant;
  },

  async update(tenantId: string, input: UpdateTenantInput) {
    await this.get(tenantId);
    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {})
      }
    });
  },

  // Shared by the superadmin route (full profile + KYC) and the tenant-admin self-service route
  // (business fields only) -- which fields can actually arrive here is enforced by which zod
  // schema validated the request body before it got here, not by this method.
  async updateProfile(tenantId: string, input: UpdateTenantProfileInput | UpdateOwnTenantProfileInput) {
    await this.get(tenantId);
    const data: Record<string, unknown> = {};
    for (const key of PROFILE_FIELD_KEYS) {
      if (key in input && (input as Record<string, unknown>)[key] !== undefined) {
        data[key] = (input as Record<string, unknown>)[key];
      }
    }
    // Derived, never client-set directly -- a KYC status change is always "reviewed now".
    if ("kycStatus" in input && input.kycStatus !== undefined) data.kycReviewedAt = new Date();
    return prisma.tenant.update({ where: { id: tenantId }, data });
  }
};
