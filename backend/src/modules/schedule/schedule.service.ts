import { prisma } from "../../config/prisma";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { DAY_ORDER } from "./schedule.schemas";

const dayIndex = new Map<string, number>(DAY_ORDER.map((d, i) => [d, i]));

export const scheduleService = {
  async list(user: AuthUser, kidId: string) {
    await assertCanAccessKid(user, kidId);
    const slots = await prisma.scheduleSlot.findMany({
      where: { kidId },
      include: { therapist: { select: { id: true, name: true } } }
    });
    // Same in-memory Mon-first sort as parentSchedule.service.ts's list() -- a free-text day
    // column can't be ordered by a custom sequence in the query itself.
    return slots.sort((a, b) => (dayIndex.get(a.dayOfWeek)! - dayIndex.get(b.dayOfWeek)!) || a.startTime.localeCompare(b.startTime));
  }
};
