import { prisma } from "../../config/prisma";
import { AuthUser } from "../middleware/auth";
import { forbidden } from "../errors/AppError";

// TENANT_ADMIN/VIEWER see every kid in their own tenant. THERAPIST sees only kids they're
// assigned to via KidTherapist -- deliberately NOT ANDed with tenantId: a kid's support team can
// include a therapist from a different tenant (a guest specialist), and that assignment itself is
// already the authorization signal. The kid stays owned/billed by its own tenantId regardless of
// which tenant any individual assigned therapist belongs to. Returns a Prisma `where` fragment to
// AND into any kid (or kid-scoped) query.
export async function kidVisibilityFilter(user: AuthUser) {
  if (user.role === "TENANT_ADMIN" || user.role === "VIEWER") {
    return { tenantId: user.tenantId! };
  }
  const therapist = await prisma.therapist.findUnique({ where: { userId: user.id } });
  if (!therapist) throw forbidden("No therapist profile found for this account");
  return { therapists: { some: { therapistId: therapist.id } } };
}

export async function assertCanAccessKid(user: AuthUser, kidId: string) {
  const filter = await kidVisibilityFilter(user);
  const kid = await prisma.kid.findFirst({ where: { id: kidId, ...filter } });
  if (!kid) throw forbidden("You do not have access to this kid");
  return kid;
}
