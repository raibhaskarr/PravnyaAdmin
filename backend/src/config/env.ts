import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// z.coerce.boolean() coerces "false" -> true (truthy string). This preprocessor
// treats "false"/"0"/"no"/"off"/"" as false and any other string as true.
const boolFromEnv = z.preprocess(
  (val) => {
    if (typeof val !== "string") return val;
    const lower = val.trim().toLowerCase();
    return lower !== "false" && lower !== "0" && lower !== "no" && lower !== "off" && lower !== "";
  },
  z.boolean()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4011),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("1d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(10),
  CORS_ORIGIN: z.string().default("http://localhost:5176"),
  // Optional: the AI-assisted goal-skill suggestion feature degrades gracefully (returns
  // "no suggestion") when neither is set, rather than failing to boot. See
  // backend/src/modules/ai/ai.platform.ts.
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  // Optional: therapist invitation emails degrade to logging the message server-side (dev-visible,
  // content-free in production) when unconfigured -- see modules/therapist-invitations/invitationEmail.service.ts.
  EMAIL_PROVIDER: z.enum(["log", "smtp"]).default("log"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: boolFromEnv.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM_NAME: z.string().default("PravnyaAdmin"),
  EMAIL_FROM_ADDRESS: z.string().default("no-reply@pravnya.com"),
  APP_BASE_URL: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
