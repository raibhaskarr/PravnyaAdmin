import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { recordAuditLog } from "../../common/audit/auditLog.service";
import { SetAssignedKidsInput, UpdateTherapistInput } from "./therapists.schemas";

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

  async update(actor: AuthUser, therapistId: string, input: UpdateTherapistInput) {
    const existing = await this.get(actor.tenantId!, therapistId);
    const updated = await prisma.therapist.update({
      where: { id: therapistId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.disciplineIds !== undefined ? { disciplineIds: input.disciplineIds } : {}),
        ...(input.status !== undefined ? { status: input.status } : {})
      },
      include: { user: { select: { email: true, name: true } } }
    });
    if (input.status !== undefined && input.status !== existing.status) {
      await recordAuditLog(actor, {
        tenantId: actor.tenantId!,
        action: input.status === "DEACTIVATED" ? "THERAPIST_DEACTIVATED" : "THERAPIST_REACTIVATED",
        fromValue: null,
        toValue: existing.user.email
      });
    }
    return updated;
  },

  // Diffs KidTherapist rows for just this one therapist -- a kid's other assigned therapists are
  // left untouched, unlike kidsService.update()'s therapistIds (which replaces a kid's whole
  // roster). All kidIds must belong to this therapist's own tenant; a tenant admin can't reach
  // into another tenant's kids from here (cross-tenant "guest" links are only ever created from
  // the kid's own side, via therapistInvitations.service.ts's inviteForKid).
  async setAssignedKids(actor: AuthUser, therapistId: string, input: SetAssignedKidsInput) {
    await this.get(actor.tenantId!, therapistId);
    if (input.kidIds.length > 0) {
      const matchingKidCount = await prisma.kid.count({ where: { id: { in: input.kidIds }, tenantId: actor.tenantId! } });
      if (matchingKidCount !== input.kidIds.length) throw notFound("One or more selected kids do not exist in your tenant");
    }

    await prisma.$transaction([
      prisma.kidTherapist.deleteMany({ where: { therapistId, kidId: { notIn: input.kidIds } } }),
      ...input.kidIds.map((kidId) =>
        prisma.kidTherapist.upsert({
          where: { kidId_therapistId: { kidId, therapistId } },
          create: { kidId, therapistId },
          update: {}
        })
      )
    ]);
  }
};
