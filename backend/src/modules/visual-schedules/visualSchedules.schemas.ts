import { z } from "zod";
import { symbolExists } from "../symbols/symbols";

export const KINDS = ["FIRST_THEN", "ROUTINE", "DAY"] as const;
export type Kind = (typeof KINDS)[number];
export const LANGUAGES = ["en", "hi"] as const;
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** How many steps each kind of schedule may have. */
export const STEP_LIMITS: Record<Kind, [number, number]> = { FIRST_THEN: [2, 2], ROUTINE: [2, 12], DAY: [2, 16] };

export const pictureSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("symbol"), symbolId: z.string().max(120).refine(symbolExists, "Unknown symbol") }),
    z.object({ kind: z.literal("photo"), mediaId: z.string().uuid() })
  ])
  .nullable();
export type Picture = z.infer<typeof pictureSchema>;

export const stepSchema = z.object({
  key: z.string().uuid(),
  /** Shown under the picture: a word or two ("Brush teeth"). */
  label: z.string().trim().min(1).max(60),
  /** Read aloud instead of the label, if set ("Now let's brush your teeth"). */
  say: z.string().trim().max(200).nullable().default(null),
  picture: pictureSchema.default(null),
  /** A countdown for this step, in minutes. */
  minutes: z.number().int().min(1).max(120).nullable().default(null)
});
export type Step = z.infer<typeof stepSchema>;

const fields = {
  title: z.string().trim().min(1).max(80),
  kind: z.enum(KINDS),
  language: z.enum(LANGUAGES),
  steps: z.array(stepSchema).min(1).max(16),
  days: z.array(z.enum(DAYS)).max(7),
  /** "HH:MM", India time; null = learn it from when the family uses the schedule. */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").nullable(),
  remind: z.boolean()
};

function stepCountOk(v: { kind?: Kind; steps?: Step[] }, ctx: z.RefinementCtx) {
  if (!v.kind || !v.steps) return;
  const [min, max] = STEP_LIMITS[v.kind];
  if (v.steps.length < min || v.steps.length > max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["steps"], message: v.kind === "FIRST_THEN" ? "First/Then has exactly 2 steps" : `This schedule needs ${min} to ${max} steps` });
  }
}

export const createSchema = z
  .object({ kidId: z.string().uuid(), ...fields, language: fields.language.default("en"), days: fields.days.default([]), time: fields.time.default(null), remind: fields.remind.default(true) })
  .superRefine(stepCountOk);

export const editSchema = z
  .object({
    title: fields.title.optional(),
    kind: fields.kind.optional(),
    language: fields.language.optional(),
    steps: fields.steps.optional(),
    days: fields.days.optional(),
    time: fields.time.optional(),
    remind: fields.remind.optional()
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
export type EditInput = z.infer<typeof editSchema>;

export const draftSchema = z.object({
  kidId: z.string().uuid(),
  kind: z.enum(KINDS),
  language: z.enum(LANGUAGES).default("en"),
  /** What the therapist wants, e.g. "getting ready for school, 5-6 steps". */
  request: z.string().trim().min(3).max(500)
});

export const listQuerySchema = z.object({ kidId: z.string().uuid() });
export const idParamsSchema = z.object({ id: z.string().uuid() });
export const parentKidParamsSchema = z.object({ kidId: z.string().uuid() });
export const parentScheduleParamsSchema = z.object({ kidId: z.string().uuid(), id: z.string().uuid() });

// Parent side: the parent describes a schedule (typed or said), Pravnya drafts it for them to check, then they save it.
export const parentDraftSchema = z
  .object({
    text: z.string().trim().min(3).max(1000).optional(),
    audio: z.object({ mimeType: z.string().max(60), base64: z.string().min(1).max(4_000_000) }).optional(),
    kind: z.enum(KINDS).nullable().default(null),
    language: z.enum(LANGUAGES).default("en")
  })
  .refine((v) => [v.text, v.audio].filter((x) => x !== undefined).length === 1, "Send text or audio");
export const parentCreateSchema = z
  .object({ ...fields, language: fields.language.default("en"), days: fields.days.default([]), time: fields.time.default(null), remind: fields.remind.default(true) })
  .superRefine(stepCountOk);
export const useSchema = z.object({ event: z.enum(["start", "complete"]) });
