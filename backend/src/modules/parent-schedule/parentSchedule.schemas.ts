import { z } from "zod";

export const scheduleKidParamsSchema = z.object({ kidId: z.string().uuid() });
export const scheduleSlotParamsSchema = z.object({ kidId: z.string().uuid(), slotId: z.string().uuid() });

// Same fixed set as onboarding's ChildTherapies step (nudges.tsx/ChildTherapies.tsx's own
// THERAPIES array) -- reused for consistency rather than a second, divergent list.
export const SCHEDULE_LABELS = ["Speech therapy", "ABA", "Occupational therapy", "Physiotherapy", "Special education", "Other"] as const;
// Same convention as Kid.selfReportedScheduleDays.
export const SCHEDULE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const createScheduleSlotSchema = z.object({
  label: z.enum(SCHEDULE_LABELS),
  dayOfWeek: z.enum(SCHEDULE_DAYS),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM"),
  therapistId: z.string().uuid().optional()
});

export type CreateScheduleSlotInput = z.infer<typeof createScheduleSlotSchema>;
