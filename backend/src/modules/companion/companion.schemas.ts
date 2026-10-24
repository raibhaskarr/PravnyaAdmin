import { z } from "zod";

export const companionParamsSchema = z.object({ kidId: z.string().uuid() });

export const sendCompanionMessageSchema = z.object({
  text: z.string().min(1).max(2000)
});

export type SendCompanionMessageInput = z.infer<typeof sendCompanionMessageSchema>;
