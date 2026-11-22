import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { pushService } from "../push/push.service";
import { effectiveTiming, inIndia, LEARN_FROM_DAYS, reminderDue } from "./visualSchedules.timing";

// Every few minutes: for each published schedule with reminders on, whose family has a device
// signed up for notifications, send "Time for ..." shortly before its time (set or learned), once a day.

export async function runScheduleReminders(now = new Date()) {
  const since = new Date(now.getTime() - LEARN_FROM_DAYS * 86_400_000);
  const schedules = await prisma.visualSchedule.findMany({
    where: { status: "ACTIVE", remind: true, kid: { parent: { pushSubscriptions: { some: {} } } } },
    select: {
      id: true,
      title: true,
      time: true,
      days: true,
      kidId: true,
      kid: { select: { firstName: true, parentId: true } },
      uses: { where: { startedAt: { gte: since } }, select: { startedAt: true, completedAt: true } }
    }
  });
  const today = inIndia(now).date;
  let sent = 0;
  for (const s of schedules) {
    const timing = effectiveTiming(s, s.uses, now);
    if (!reminderDue(timing, s.uses, now)) continue;
    // Claim today's reminder first, so two runs never both send it.
    try {
      await prisma.visualScheduleReminder.create({ data: { scheduleId: s.id, forDate: today } });
    } catch {
      continue;
    }
    sent += await pushService.sendToParent(s.kid.parentId!, {
      title: `Time for ${s.title}`,
      body: `Open ${s.kid.firstName}'s picture schedule`,
      url: `/?kid=${s.kidId}&schedule=${s.id}`,
      tag: `schedule-${s.id}`
    });
  }
  return { checked: schedules.length, sent };
}

let timer: NodeJS.Timeout | null = null;

export function startScheduleReminders() {
  if (timer || env.NODE_ENV === "test" || !env.SCHEDULE_REMINDERS_ENABLED || !pushService.publicKey()) return;
  const run = () => void runScheduleReminders().catch((e) => console.error("[schedule reminders] run failed:", e instanceof Error ? e.message : e));
  timer = setInterval(run, 5 * 60_000);
  timer.unref();
}
