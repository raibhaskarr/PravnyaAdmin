import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { CreateScheduleSlotInput, SCHEDULE_DAYS } from "./parentSchedule.schemas";

const DAY_ORDER = new Map<string, number>(SCHEDULE_DAYS.map((d, i) => [d, i]));

export const parentScheduleService = {
  async list(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    const slots = await prisma.scheduleSlot.findMany({
      where: { kidId },
      include: { therapist: { select: { id: true, name: true } } }
    });
    // Mon-first day ordering, then by time -- a free-text column can't be ordered by a custom
    // sequence in the query itself, so sort the (small, per-kid) result in memory.
    return slots.sort((a, b) => (DAY_ORDER.get(a.dayOfWeek)! - DAY_ORDER.get(b.dayOfWeek)!) || a.startTime.localeCompare(b.startTime));
  },

  async create(parentId: string, kidId: string, input: CreateScheduleSlotInput) {
    await assertOwnsKid(parentId, kidId);

    if (input.therapistId) {
      // Never let a parent attach a therapistId that isn't actually linked to this kid, even if
      // it's a real Therapist elsewhere in the system.
      const link = await prisma.kidTherapist.findUnique({ where: { kidId_therapistId: { kidId, therapistId: input.therapistId } } });
      if (!link) throw notFound("That therapist isn't on this kid's care team.");
    }

    return prisma.scheduleSlot.create({
      data: {
        kidId,
        label: input.label,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        therapistId: input.therapistId ?? null
      },
      include: { therapist: { select: { id: true, name: true } } }
    });
  },

  async remove(parentId: string, kidId: string, slotId: string) {
    await assertOwnsKid(parentId, kidId);
    const result = await prisma.scheduleSlot.deleteMany({ where: { id: slotId, kidId } });
    if (result.count === 0) throw notFound("Schedule slot not found");
  }
};
