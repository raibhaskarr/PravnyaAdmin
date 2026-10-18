import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { kidVisibilityFilter } from "../../common/access/kidAccess";

export const parentsService = {
  // A household (Parent) isn't tenant-scoped -- a sibling can be at a different tenant entirely
  // (see docs/manual/06-parent-kid-onboarding-spec.md). So "which households can I see" is derived
  // from "which kids can I see" (the same filter every other kid-scoped view already uses: for
  // THERAPIST, only kids they're assigned to, not every kid in the tenant), never a direct
  // Parent-table query -- that would leak the existence of households with zero kids visible to
  // this caller.
  async list(user: AuthUser) {
    const filter = await kidVisibilityFilter(user);
    const kids = await prisma.kid.findMany({
      where: { ...filter, parentId: { not: null } },
      select: { parentId: true }
    });

    const kidCountByParentId = new Map<string, number>();
    for (const kid of kids) {
      const parentId = kid.parentId!;
      kidCountByParentId.set(parentId, (kidCountByParentId.get(parentId) ?? 0) + 1);
    }
    if (kidCountByParentId.size === 0) return [];

    const parents = await prisma.parent.findMany({
      where: { id: { in: [...kidCountByParentId.keys()] } },
      orderBy: { createdAt: "desc" }
    });
    return parents.map((parent) => ({ ...parent, kidCount: kidCountByParentId.get(parent.id)! }));
  },

  // Returns the household plus only the kids under it that this caller can actually see -- never
  // a sibling at a tenant (or, for THERAPIST, a kid) this caller has no relationship with. A
  // household that exists but has zero kids visible to this caller 404s exactly the same as a
  // household that doesn't exist at all, so the response can't be used to learn "this parent
  // exists somewhere, just not here."
  async get(user: AuthUser, parentId: string) {
    const filter = await kidVisibilityFilter(user);
    const kids = await prisma.kid.findMany({
      where: { ...filter, parentId },
      orderBy: { firstName: "asc" }
    });
    if (kids.length === 0) throw notFound("Household not found");

    const parent = await prisma.parent.findUniqueOrThrow({ where: { id: parentId } });
    return { parent, kids };
  }
};
