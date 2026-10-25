import { z } from "zod";

export const companionParamsSchema = z.object({ kidId: z.string().uuid() });

// Staff-side read (admin panel's Kid detail > Companion tab) uses a query param, not a route
// param -- same flat-prefix convention goals.routes.ts uses for its own kid-scoped GET.
export const staffCompanionQuerySchema = z.object({ kidId: z.string().uuid() });

export const sendCompanionMessageSchema = z.object({
  text: z.string().min(1).max(2000)
});

export type SendCompanionMessageInput = z.infer<typeof sendCompanionMessageSchema>;
