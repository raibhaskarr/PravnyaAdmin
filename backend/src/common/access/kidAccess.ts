import { prisma } from "../../config/prisma";
import { AuthUser } from "../middleware/auth";
import { forbidden } from "../errors/AppError";

// TENANT_ADMIN/VIEWER see every kid in the tenant; THERAPIST sees only kids they're assigned to
// via KidTherapist. Returns a Prisma `where` fragment to AND into any kid (or kid-scoped) query.
export async function kidVisibilityFilter(user: AuthUser) {
  if (user.role === "TENANT_ADMIN" || user.role === "VIEWER") {
    return { tenantId: user.tenantId! };
  }
  const therapist = await prisma.therapist.findUnique({ where: { userId: user.id } });
  if (!therapist) throw forbidden("No therapist profile found for this account");
  return { tenantId: user.tenantId!, therapists: { some: { therapistId: therapist.id } } };
}

export async function assertCanAccessKid(user: AuthUser, kidId: string) {
  const filter = await kidVisibilityFilter(user);
  const kid = await prisma.kid.findFirst({ where: { id: kidId, ...filter } });
  if (!kid) throw forbidden("You do not have access to this kid");
  return kid;
}
