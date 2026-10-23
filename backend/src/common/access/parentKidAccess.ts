import { prisma } from "../../config/prisma";
import { notFound } from "../errors/AppError";

// Parent-auth equivalent of assertCanAccessKid (kidAccess.ts), which is staff-only (takes an
// AuthUser, uses kidVisibilityFilter/tenant membership). A parent's access is much simpler --
// Kid.parentId === the caller, nothing tenant-shaped about it -- so this doesn't reuse that
// function, just mirrors its "404, not 403, on a kid that isn't yours" behavior.
export async function assertOwnsKid(parentId: string, kidId: string) {
  const kid = await prisma.kid.findFirst({ where: { id: kidId, parentId }, select: { id: true, tenantId: true } });
  if (!kid) throw notFound("Kid not found");
  return kid;
}
