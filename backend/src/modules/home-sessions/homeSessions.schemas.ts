import { z } from "zod";

export const ACTIVITY_TYPES = [
  "DISCRETE_TRIAL", // ABA: a clear instruction, the child's response, immediate reward
  "RECEPTIVE_ID", // "Show me / touch the ball" from a few choices
  "EXPRESSIVE_LABEL", // "What's this?" -> the child names it
  "AAC_LABEL", // the child finds and presses the word on their AAC device
  "ARTICULATION", // saying a sound / word clearly, with repetitions
  "REQUESTING", // the child asks for something they want (mand)
  "FOLLOW_DIRECTIONS", // one- or two-step instructions
  "IMITATION", // copying an action or a sound
  "OTHER"
] as const;

export const HELP_LEVELS = ["VISUAL_PROMPT", "GESTURAL_PROMPT", "VERBAL_PROMPT", "PHYSICAL_PROMPT", "PARTIAL_ASSISTANCE", "FULL_ASSISTANCE"] as const;
export const RESPONSE_MODALITIES = ["VERBAL", "AAC", "MANUAL_SIGN", "GESTURAL", "NOT_APPLICABLE"] as const;
export const LANGUAGES = ["en", "hi"] as const;
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const activitySchema = z.object({
  key: z.string().uuid(),
  goalId: z.string().uuid(),
  goalTitle: text(300),
  type: z.enum(ACTIVITY_TYPES),
  items: z.array(z.object({ goalItemId: z.string().uuid(), label: text(120) })).min(1).max(10),
  trialsPerItem: z.number().int().min(1).max(10),
  /** What to get ready before the first try. */
  setup: text(500),
  /** What the parent says or does to start each try. "{item}" is replaced with the item. */
  instruction: text(300),
  correctLooksLike: text(300),
  /** Least help first. */
  prompts: z.array(z.object({ supportLevel: z.enum(HELP_LEVELS), say: text(200) })).min(1).max(5),
  /** What to do right after a miss. */
  errorCorrection: text(400),
  reinforcement: text(200),
  modality: z.enum(RESPONSE_MODALITIES),
  /** After this many misses in a row on one item, move on to the next item. */
  missesBeforeMovingOn: z.number().int().min(1).max(5)
});
export type Activity = z.infer<typeof activitySchema>;

export const planSchema = z
  .object({
    intro: text(500),
    activities: z.array(activitySchema).min(1).max(6),
    closing: text(400)
  })
  .refine((p) => p.activities.reduce((n, a) => n + a.items.length * a.trialsPerItem, 0) <= 60, "A session can have at most 60 tries in all");
export type Plan = z.infer<typeof planSchema>;

export const scheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once") }),
  z.object({ kind: z.literal("weekly"), days: z.array(z.enum(DAYS)).min(1).max(7), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })
]);
export type Schedule = z.infer<typeof scheduleSchema>;

export const listQuerySchema = z.object({ kidId: z.string().uuid() });
export const sessionParamsSchema = z.object({ id: z.string().uuid() });

export const draftSessionSchema = z.object({
  kidId: z.string().uuid(),
  goalIds: z.array(z.string().uuid()).min(1).max(6),
  title: z.string().trim().min(1).max(120).optional(),
  language: z.enum(LANGUAGES).default("en"),
  schedule: scheduleSchema.default({ kind: "once" })
});

export const editSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    language: z.enum(LANGUAGES).optional(),
    schedule: scheduleSchema.optional(),
    plan: planSchema.optional()
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");

// Parent side
export const parentKidParamsSchema = z.object({ kidId: z.string().uuid() });
export const parentSessionParamsSchema = z.object({ kidId: z.string().uuid(), sessionId: z.string().uuid() });
export const parentRunParamsSchema = z.object({ kidId: z.string().uuid(), runId: z.string().uuid() });
export const startPracticeSchema = z.object({ language: z.enum(LANGUAGES).default("en") });
export const turnSchema = z
  .object({
    /** A tapped button (an id from the step's choices). */
    choice: z.string().max(60).optional(),
    /** Typed by the parent. Interpreted, never stored. */
    text: z.string().trim().min(1).max(1000).optional(),
    /** A short voice reply. Interpreted, never stored. */
    audio: z.object({ mimeType: z.string().max(60), base64: z.string().min(1).max(4_000_000) }).optional()
  })
  .refine((v) => [v.choice, v.text, v.audio].filter((x) => x !== undefined).length === 1, "Send exactly one of choice, text or audio");
