import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { UpdateTherapistInput } from "./therapists.schemas";

export const therapistsService = {
  list(tenantId: string) {
    return prisma.therapist.findMany({
      where: { tenantId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { name: "asc" }
    });
  },

  async get(tenantId: string, therapistId: string) {
    const therapist = await prisma.therapist.findFirst({
      where: { id: therapistId, tenantId },
      include: { user: { select: { email: true, name: true } } }
    });
    if (!therapist) throw notFound("Therapist not found");
    return therapist;
  },

  async update(tenantId: string, therapistId: string, input: UpdateTherapistInput) {
    await this.get(tenantId, therapistId);
    return prisma.therapist.update({
      where: { id: therapistId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.disciplineIds !== undefined ? { disciplineIds: input.disciplineIds } : {})
      }
    });
  }
};
