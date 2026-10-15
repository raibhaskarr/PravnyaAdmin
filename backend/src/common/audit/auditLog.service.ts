import { prisma } from "../../config/prisma";
import { AuthUser } from "../middleware/auth";

// Shared by every module that logs a change to an existing tenant -- currently just
// tenants.service.ts, expected to grow as more superadmin actions get audited. See the schema
// comment on AuditLog for why this doesn't cover tenant invitations (no real Tenant row exists yet
// at that point) or a platform-wide log of every mutation.
export async function recordAuditLog(actor: AuthUser, params: { tenantId: string; action: string; fromValue: string | null; toValue: string | null }) {
  const actorUser = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { email: true } });
  return prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      actorUserId: actor.id,
      actorEmail: actorUser.email,
      action: params.action,
      fromValue: params.fromValue,
      toValue: params.toValue
    }
  });
}

export function listAuditLogForTenant(tenantId: string) {
  return prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}
