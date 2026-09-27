import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid, kidVisibilityFilter } from "../../common/access/kidAccess";
import { CreateKidInput, UpdateKidInput } from "./kids.schemas";

export const kidsService = {
  async list(user: AuthUser) {
    const filter = await kidVisibilityFilter(user);
    return prisma.kid.findMany({
      where: filter,
      include: { therapists: { include: { therapist: { select: { id: true, name: true } } } } },
      orderBy: { firstName: "asc" }
    });
  },

  async get(user: AuthUser, kidId: string) {
    await assertCanAccessKid(user, kidId);
    const kid = await prisma.kid.findUnique({
      where: { id: kidId },
      include: { therapists: { include: { therapist: { select: { id: true, name: true } } } }, goals: true }
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
