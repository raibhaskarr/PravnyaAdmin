import { prisma } from "../../config/prisma";
import { conflict, notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { kidVisibilityFilter } from "../../common/access/kidAccess";
import { findOrCreateParent } from "../../common/parents/findOrCreateParent";
import { CreateParentInput, UpdateParentInput } from "./parents.schemas";

// TENANT_ADMIN/VIEWER already see every kid in their own tenant (kidVisibilityFilter's own
// unfiltered tenantId match) -- extend that same breadth to a parent record with zero kids yet
// (the standalone "Add parent" flow, no first kid attached). THERAPIST's kid visibility is
// intentionally narrower (only kids they're assigned to, not the whole tenant's), so a zero-kid
// parent stays invisible to them until a kid they're assigned to is actually linked to it --
// consistent with how much less of the tenant's roster they can see everywhere else.
function canSeeEveryKidInTenant(user: AuthUser) {
  return user.role === "TENANT_ADMIN" || user.role === "VIEWER";
}

export const parentsService = {
  // A parent isn't tenant-scoped -- a sibling can be at a different tenant entirely (see
  // docs/manual/06-parent-kid-onboarding-spec.md). So "which parents can I see" is primarily
  // derived from "which kids can I see" (the same filter every other kid-scoped view already
  // uses), plus -- for roles that already see every kid in the tenant -- any parent their own
  // tenant created that doesn't have a visible kid yet.
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

    if (canSeeEveryKidInTenant(user)) {
      const zeroKidParents = await prisma.parent.findMany({
        where: { createdByTenantId: user.tenantId!, id: { notIn: [...kidCountByParentId.keys()] } },
        select: { id: true }
      });
      for (const p of zeroKidParents) kidCountByParentId.set(p.id, 0);
    }

    if (kidCountByParentId.size === 0) return [];

    const parents = await prisma.parent.findMany({
      where: { id: { in: [...kidCountByParentId.keys()] } },
      orderBy: { createdAt: "desc" }
    });
    return parents.map((parent) => ({ ...parent, kidCount: kidCountByParentId.get(parent.id)! }));
  },

  // Returns the parent plus only the kids under it that this caller can actually see -- never a
  // sibling at a tenant (or, for THERAPIST, a kid) this caller has no relationship with. A parent
  // that exists but has zero kids visible to this caller 404s exactly the same as a parent that
  // doesn't exist at all (unless list()'s same zero-kid-but-created-here exception applies), so
  // the response can't be used to learn "this parent exists somewhere, just not here."
  async get(user: AuthUser, parentId: string) {
    const filter = await kidVisibilityFilter(user);
    const kids = await prisma.kid.findMany({
      where: { ...filter, parentId },
      orderBy: { firstName: "asc" }
    });

    if (kids.length === 0) {
      if (canSeeEveryKidInTenant(user)) {
        const parent = await prisma.parent.findFirst({ where: { id: parentId, createdByTenantId: user.tenantId! } });
        if (parent) return { parent, kids };
      }
      throw notFound("Parent not found");
    }

    const parent = await prisma.parent.findUniqueOrThrow({ where: { id: parentId } });
    return { parent, kids };
  },

  // Standalone creation -- "Add parent" with no first kid. TENANT_ADMIN-only (see routes); a
  // THERAPIST never reaches this, so canSeeEveryKidInTenant's narrower carve-out never needs to
  // apply to a parent they themselves created.
  create(actor: AuthUser, input: CreateParentInput) {
    return findOrCreateParent({ ...input, actorTenantId: actor.tenantId! });
  },

  // TENANT_ADMIN-only (see routes) -- same visibility check as get() so an admin can't reach into
  // a parent entirely outside their own tenant's kids by guessing an id. Editing parentEmail here
  // only changes where a self-service account is reachable at -- it never touches passwordHash,
  // so an already-claimed account keeps its password and an unclaimed one still needs its own
  // registration/verification to be usable, exactly like before the edit.
  async update(actor: AuthUser, parentId: string, input: UpdateParentInput) {
    await parentsService.get(actor, parentId);

    if (input.parentEmail) {
      const existing = await prisma.parent.findUnique({ where: { email: input.parentEmail } });
      if (existing && existing.id !== parentId) {
        throw conflict("Another parent already uses this email.", "EMAIL_TAKEN");
      }
    }

    return prisma.parent.update({
      where: { id: parentId },
      data: {
        email: input.parentEmail,
        mobile: input.parentMobile,
        fatherName: input.fatherName,
        motherName: input.motherName,
        addressLine1: input.addressLine1,
        city: input.city
      }
    });
  }
};
