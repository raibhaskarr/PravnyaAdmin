import { z } from "zod";

export const scheduleQuerySchema = z.object({ kidId: z.string().uuid() });

// Mirrors parent-schedule/parentSchedule.schemas.ts's own DAY_ORDER list -- duplicated, not
// imported, same convention every parent/staff module pair in this codebase already follows.
export const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
