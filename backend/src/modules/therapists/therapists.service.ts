import crypto from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, notFound } from "../../common/errors/AppError";
import { authService } from "../auth/auth.service";
import { CreateTherapistInput, UpdateTherapistInput } from "./therapists.schemas";

function generateTempPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

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

  async create(tenantId: string, input: CreateTherapistInput) {
    const existingEmail = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingEmail) throw new AppError(409, "EMAIL_TAKEN", "That email is already in use");

    const tempPassword = generateTempPassword();
    const passwordHash = await authService.hashPassword(tempPassword);

    const therapist = await prisma.therapist.create({
      data: {
        tenant: { connect: { id: tenantId } },
        name: input.name,
        disciplineIds: input.disciplineIds,
        user: {
          create: { email: input.email, name: input.name, role: UserRole.THERAPIST, passwordHash, tenant: { connect: { id: tenantId } } }
        }
      },
      include: { user: { select: { email: true, name: true } } }
    });

    return { therapist, tempPassword };
  },

  async update(tenantId: string, therapistId: string, input: UpdateTherapistInput) {
    await this.get(tenantId, therapistId);
    return prisma.therapist.update({
      where: { id: therapistId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.disciplineIds !== undefined ? { disciplineIds: input.disciplineIds } : {})
      }
    });
  }
};
