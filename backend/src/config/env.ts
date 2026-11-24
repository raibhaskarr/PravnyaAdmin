import dotenv from "dotenv";
import { z } from "zod";

// Tests get their whole config from the environment (backend/.env.test locally, workflow env in
// CI) -- never from backend/.env, so a developer's real API keys, tenant ids or database can't
// leak into a test run.
if (process.env.NODE_ENV !== "test") dotenv.config();

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
  // "Call Pravnya" (hands-free home sessions) uses Gemini's Live API with this model.
  GEMINI_LIVE_MODEL: z.string().default("gemini-3.8-live"),
  // The API version for its short-lived tokens; the phone connects with the same one.
  GEMINI_LIVE_API_VERSION: z.enum(["v1beta", "v1alpha"]).default("v1beta"),
  // Optional: therapist invitation emails degrade to logging the message server-side (dev-visible,
  // content-free in production) when unconfigured -- see modules/therapist-invitations/invitationEmail.service.ts.
  // "memory" is test-only: emails are kept in an in-process outbox (testOutbox) instead of sent,
  // so automated tests can read verification codes and invite links. Refused in production.
  EMAIL_PROVIDER: z.enum(["log", "smtp", "memory"]).default("log"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: boolFromEnv.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM_NAME: z.string().default("PravnyaAdmin"),
  EMAIL_FROM_ADDRESS: z.string().default("no-reply@pravnya.com"),
  APP_BASE_URL: z.string().optional(),
  // The parent app's address, linked from emails sent to parents (progress updates).
  PARENT_APP_URL: z.string().default("https://app.pravnya.com"),
  // The hourly job that deletes parent accounts whose 30-day grace period has ended. Never runs in tests.
  PARENT_PURGE_ENABLED: boolFromEnv.default(true),
  // Home tenant for every self-registered (B2C/retail) parent's kids -- "Pravnix Labs Pvt Ltd" in
  // production. Optional here so existing environments/CI without it configured still boot; the
  // parent-kids endpoint itself throws a clear error if a kid-creation call arrives and this is
  // unset, rather than failing silently or guessing a tenant. See
  // docs/manual/06-parent-kid-onboarding-spec.md.
  RETAIL_TENANT_ID: z.string().optional(),
  // Where uploaded pictures (photos on visual schedules) are kept. "s3" works with any
  // S3-compatible store (AWS S3, Cloudflare R2, ...); "local" keeps them on disk, for development.
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolFromEnv.default(false),
  // Web Push (schedule reminders in the parent app). Make a pair with `npx web-push generate-vapid-keys`.
  // Without them reminders are off and the app doesn't offer them.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  // How often the reminder job runs. Never runs in tests.
  SCHEDULE_REMINDERS_ENABLED: boolFromEnv.default(true),
  // Mulberry symbol pictures (see modules/symbols). Pinned to the commit the index was built from.
  SYMBOLS_BASE_URL: z.string().default("https://cdn.jsdelivr.net/gh/mulberrysymbols/mulberry-symbols@fa94a93ca1b5357c0b6e0d9f8a81c426a1dfefdf/EN"),
  /** ARASAAC pictograms CDN. Can be swapped for our own bucket once we proxy them. */
  ARASAAC_BASE_URL: z.string().default("https://static.arasaac.org/pictograms")
}).superRefine((v, ctx) => {
  if (v.STORAGE_DRIVER !== "s3") return;
  for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
    if (!v[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "Required when STORAGE_DRIVER=s3" });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
