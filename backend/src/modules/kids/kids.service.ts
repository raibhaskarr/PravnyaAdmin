import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid, kidVisibilityFilter } from "../../common/access/kidAccess";
import { recordAuditLog } from "../../common/audit/auditLog.service";
import { CreateKidInput, UpdateKidInput } from "./kids.schemas";

// Shared across list/get -- includes each assigned therapist's own tenant so the frontend can
// label a cross-tenant ("guest") therapist, since a kid's support team is no longer guaranteed to
// all share the kid's own tenant, plus disciplineIds/status so the support team table can render
// a discipline and an active/deactivated role without a second lookup against the home roster
// (which wouldn't even cover a cross-tenant guest). See kidAccess.ts.
const therapistsInclude = {
  therapists: {
    include: { therapist: { select: { id: true, name: true, disciplineIds: true, status: true, tenant: { select: { id: true, name: true } } } } }
  }
};

export const kidsService = {
  async list(user: AuthUser) {
    const filter = await kidVisibilityFilter(user);
    return prisma.kid.findMany({
      where: filter,
      include: therapistsInclude,
      orderBy: { firstName: "asc" }
    });
  },

  async get(user: AuthUser, kidId: string) {
    await assertCanAccessKid(user, kidId);
    const kid = await prisma.kid.findUnique({
      where: { id: kidId },
      include: { ...therapistsInclude, goals: true }
    });
    if (!kid) throw notFound("Kid not found");
    return kid;
  },

  async create(actor: AuthUser, input: CreateKidInput) {
    const kid = await prisma.kid.create({
      data: {
        tenantId: actor.tenantId!,
        firstName: input.firstName,
        lastName: input.lastName,
        dob: input.dob ? new Date(input.dob) : undefined,
        therapists: { create: input.therapistIds.map((therapistId) => ({ therapistId })) }
      },
      include: { therapists: true }
    });
    // No kid name here -- this AuditLog table is shared with the superadmin's per-tenant Activity
    // view (tenants.service.ts's auditLog()), which is deliberately kept blind to individual kid
    // identity (see health()'s own comment). The event itself is fine to surface; a child's name
    // is not.
    await recordAuditLog(actor, { tenantId: actor.tenantId!, action: "KID_ADDED", fromValue: null, toValue: null });
    return kid;
  },

  async update(user: AuthUser, kidId: string, input: UpdateKidInput) {
    await assertCanAccessKid(user, kidId);

    if (input.therapistIds !== undefined) {
      // Therapist ids are intentionally not tenant-scoped here -- a kid's support team can
      // include a guest therapist from another tenant (see kidAccess.ts). Still worth a clean
      // existence check up front rather than letting a bad id fail as a raw FK error.
      const existingCount = await prisma.therapist.count({ where: { id: { in: input.therapistIds } } });
      if (existingCount !== input.therapistIds.length) throw notFound("One or more selected therapists do not exist");

      await prisma.kidTherapist.deleteMany({ where: { kidId } });
      await prisma.kidTherapist.createMany({
        data: input.therapistIds.map((therapistId) => ({ kidId, therapistId }))
      });
    }

    return prisma.kid.update({
      where: { id: kidId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.dob !== undefined ? { dob: input.dob ? new Date(input.dob) : null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {})
      }
    });
  }
};
