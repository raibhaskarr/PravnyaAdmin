import crypto from "node:crypto";
import { prisma } from "../../config/prisma";
import { AppError, notFound } from "../../common/errors/AppError";
import { authService } from "../auth/auth.service";
import { CreateTenantInput, UpdateTenantInput, UpdateTenantProfileInput } from "./tenants.schemas";

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

function generateTempPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

export const tenantsService = {
  list() {
    return prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
  },

  async get(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw notFound("Tenant not found");
    return tenant;
  },

  // Creates the tenant and its first Tenant Admin user in one step. The temp password is
  // returned once, here -- never logged, never retrievable again. The admin is expected to
  // change it after first login (not enforced yet -- no forced-password-change flow built here).
  async create(input: CreateTenantInput) {
    const existingEmail = await prisma.user.findUnique({ where: { email: input.adminEmail } });
    if (existingEmail) throw new AppError(409, "EMAIL_TAKEN", "That email is already in use");

    const tempPassword = generateTempPassword();
    const passwordHash = await authService.hashPassword(tempPassword);

    const tenant = await prisma.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        // Lead owner defaults to the admin contact when left blank, but stays independently
        // editable afterward -- see the doc comment on the Tenant model.
        leadOwnerName: input.leadOwnerName ?? input.adminName,
        leadOwnerEmail: input.leadOwnerEmail ?? input.adminEmail,
        ...(input.leadOwnerPhone !== undefined ? { leadOwnerPhone: input.leadOwnerPhone } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.socialLinks !== undefined ? { socialLinks: input.socialLinks } : {}),
        ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
        ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.kycStatus !== undefined ? { kycStatus: input.kycStatus, kycReviewedAt: new Date() } : {}),
        ...(input.kycNotes !== undefined ? { kycNotes: input.kycNotes } : {}),
        users: {
          create: {
            email: input.adminEmail,
            name: input.adminName,
            role: "TENANT_ADMIN",
            passwordHash
          }
        }
      },
      include: { users: { select: { id: true, email: true, name: true, role: true } } }
    });

    return { tenant, adminEmail: input.adminEmail, tempPassword };
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

  async updateProfile(tenantId: string, input: UpdateTenantProfileInput) {
    await this.get(tenantId);
    const data: Record<string, unknown> = {};
    for (const key of PROFILE_FIELD_KEYS) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    // Derived, never client-set directly -- a KYC status change is always "reviewed now".
    if (input.kycStatus !== undefined) data.kycReviewedAt = new Date();
    return prisma.tenant.update({ where: { id: tenantId }, data });
  }
};
