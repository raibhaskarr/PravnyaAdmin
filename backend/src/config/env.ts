import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

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
  GEMINI_API_KEY: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
