import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid, kidVisibilityFilter } from "../../common/access/kidAccess";
import { CreateKidInput, UpdateKidInput } from "./kids.schemas";

// Shared across list/get -- includes each assigned therapist's own tenant so the frontend can
// label a cross-tenant ("guest") therapist, since a kid's support team is no longer guaranteed to
// all share the kid's own tenant. See kidAccess.ts.
const therapistsInclude = {
  therapists: { include: { therapist: { select: { id: true, name: true, tenant: { select: { id: true, name: true } } } } } }
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

  create(tenantId: string, input: CreateKidInput) {
    return prisma.kid.create({
      data: {
        tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        dob: input.dob ? new Date(input.dob) : undefined,
        therapists: { create: input.therapistIds.map((therapistId) => ({ therapistId })) }
      },
      include: { therapists: true }
    });
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
