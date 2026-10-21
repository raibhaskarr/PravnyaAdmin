import { z } from "zod";

export const sendVerificationCodeSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase())
});

export const registerSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(200),
  name: z.string().min(1),
  verificationCode: z.string().length(6),
  // Explicit affirmative consent, matching the consent screen -- not implied by submitting the
  // form. Same pattern as PravnyaAdmin's own staff registerSchema precedent.
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required to create an account." }) })
});

export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1)
});

export type SendVerificationCodeInput = z.infer<typeof sendVerificationCodeSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
