import { z } from "zod";

// Deleting an account re-confirms the password, so a phone left unlocked isn't enough.
export const deleteAccountSchema = z.object({ password: z.string().min(1) });
export const exportQuerySchema = z.object({ token: z.string().min(1) });
