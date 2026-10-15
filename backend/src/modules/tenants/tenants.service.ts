import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { listAuditLogForTenant, recordAuditLog } from "../../common/audit/auditLog.service";
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

const STALE_ACTIVITY_WINDOW_DAYS = 30;

export const tenantsService = {
  list() {
    return prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
  },

  // Counts only, no kid-level identity -- a superadmin shouldn't need to see individual kids or
  // their clinical data to tell whether a tenant looks healthy or has gone quiet. "No recent
  // activity" means no GoalItemEvidence created in the last 30 days, not the evidence's own
  // (sometimes backdated) logDate -- this is about whether the system is actually being used, not
  // when a session clinically happened.
  async health() {
    const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
    const recentCutoff = new Date(Date.now() - STALE_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    return Promise.all(
      tenants.map(async (tenant) => {
        const [totalKids, kidsWithNoGoals, kidsWithRecentActivity] = await Promise.all([
          prisma.kid.count({ where: { tenantId: tenant.id } }),
          prisma.kid.count({ where: { tenantId: tenant.id, goals: { none: {} } } }),
          prisma.kid.count({
            where: {
              tenantId: tenant.id,
              goals: { some: { items: { some: { evidence: { some: { createdAt: { gte: recentCutoff } } } } } } }
            }
          })
        ]);
        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          totalKids,
          kidsWithNoGoals,
          kidsWithNoRecentActivity: totalKids - kidsWithRecentActivity
        };
      })
    );
  },

  async get(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw notFound("Tenant not found");
    return tenant;
  },

  async update(actor: AuthUser, tenantId: string, input: UpdateTenantInput) {
    const existing = await this.get(tenantId);
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {})
      }
    });
    if (input.status !== undefined && input.status !== existing.status) {
      await recordAuditLog(actor, { tenantId, action: "TENANT_STATUS_CHANGED", fromValue: existing.status, toValue: input.status });
    }
    return updated;
  },

  // Shared by the superadmin route (full profile + KYC) and the tenant-admin self-service route
  // (business fields only) -- which fields can actually arrive here is enforced by which zod
  // schema validated the request body before it got here, not by this method. Only the KYC change
  // gets audited: it's the only field here a superadmin (as opposed to the tenant's own admin)
  // ever sets, so it's the only one worth a "who approved/rejected this tenant and when" trail.
  async updateProfile(actor: AuthUser, tenantId: string, input: UpdateTenantProfileInput | UpdateOwnTenantProfileInput) {
    const existing = await this.get(tenantId);
    const data: Record<string, unknown> = {};
    for (const key of PROFILE_FIELD_KEYS) {
      if (key in input && (input as Record<string, unknown>)[key] !== undefined) {
        data[key] = (input as Record<string, unknown>)[key];
      }
    }
    // Derived, never client-set directly -- a KYC status change is always "reviewed now".
    if ("kycStatus" in input && input.kycStatus !== undefined) data.kycReviewedAt = new Date();
    const updated = await prisma.tenant.update({ where: { id: tenantId }, data });
    if ("kycStatus" in input && input.kycStatus !== undefined && input.kycStatus !== existing.kycStatus) {
      await recordAuditLog(actor, { tenantId, action: "TENANT_KYC_STATUS_CHANGED", fromValue: existing.kycStatus, toValue: input.kycStatus });
    }
    return updated;
  },

  auditLog(tenantId: string) {
    return listAuditLogForTenant(tenantId);
  }
};
