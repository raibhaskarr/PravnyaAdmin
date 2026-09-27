import crypto from "node:crypto";
import { prisma } from "../../config/prisma";
import { AppError, notFound } from "../../common/errors/AppError";
import { authService } from "../auth/auth.service";
import { CreateTenantInput, UpdateTenantInput } from "./tenants.schemas";

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
  }
};
