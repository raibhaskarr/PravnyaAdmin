import { prisma } from "../../config/prisma";
import { conflict, notFound } from "../../common/errors/AppError";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { CreateScheduleSlotInput, SCHEDULE_DAYS } from "./parentSchedule.schemas";

const DAY_ORDER = new Map<string, number>(SCHEDULE_DAYS.map((d, i) => [d, i]));

// A kid can't physically be in two therapy slots at once -- same day+time is always a clash,
// regardless of label or therapist, so this runs for both create and update (excluding the slot
// being edited, so saving a slot's own unchanged day/time doesn't conflict with itself).
async function assertNoClash(kidId: string, dayOfWeek: string, startTime: string, excludeSlotId?: string) {
  const clash = await prisma.scheduleSlot.findFirst({
    where: { kidId, dayOfWeek, startTime, ...(excludeSlotId ? { id: { not: excludeSlotId } } : {}) }
  });
  if (clash) throw conflict(`${dayOfWeek} at ${startTime} is already on the schedule.`);
}

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
    await assertNoClash(kidId, input.dayOfWeek, input.startTime);

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

  // Full-replace update (same shape as create), not a partial patch -- the Schedule UI's edit
  // form is always pre-filled with every field, so there's never a "leave this one alone" case
  // to support. This is what replaced the old delete-and-recreate workaround.
  async update(parentId: string, kidId: string, slotId: string, input: CreateScheduleSlotInput) {
    await assertOwnsKid(parentId, kidId);
    const existing = await prisma.scheduleSlot.findFirst({ where: { id: slotId, kidId } });
    if (!existing) throw notFound("Schedule slot not found");
    await assertNoClash(kidId, input.dayOfWeek, input.startTime, slotId);

    if (input.therapistId) {
      const link = await prisma.kidTherapist.findUnique({ where: { kidId_therapistId: { kidId, therapistId: input.therapistId } } });
      if (!link) throw notFound("That therapist isn't on this kid's care team.");
    }

    return prisma.scheduleSlot.update({
      where: { id: slotId },
      data: {
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
