import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createExecutionContext } from "@pravnix/ai-core";
import type { AiContentPart } from "@pravnix/ai-core";
import { orchestrator } from "../ai/ai.platform";
import { bestSymbol } from "../symbols/symbols";
import { KINDS, STEP_LIMITS, type Kind, type Step } from "./visualSchedules.schemas";

// Drafting a picture schedule from what the therapist asked for. The AI writes short labels and an
// English search word for each picture; the picture itself is picked from the Mulberry set here.

const PROMPT =
  "You are a paediatric occupational and speech therapist making a visual (picture) schedule for an autistic or " +
  "developmentally delayed child. The request comes from the child's therapist or parent. A parent will show it on a phone or tablet, one picture per step, and the app reads each " +
  "label aloud. Rules: one concrete action per step; labels of 1-3 simple words a young child understands (\"Wash hands\", " +
  "\"Shoes on\"); in order; no explanations or punctuation in labels; for FIRST_THEN give exactly 2 steps: the less preferred " +
  "task first, then the reward. 'symbolSearch' is 1-2 plain ENGLISH words to find a simple picture for the step " +
  "(e.g. \"brush teeth\", \"toilet\", \"shoes\", \"park\"). Use 'minutes' only when a step should have a countdown " +
  "(e.g. brushing teeth: 2), otherwise null. 'say' is null unless a longer spoken sentence really helps. " +
  "If no kind is given, choose one: FIRST_THEN (a task then a reward), ROUTINE (the steps of one activity) or DAY (the parts of a day). " +
  "'time' is when it's usually done, as \"HH:MM\" (24-hour), only if the request says so (\"every morning at 7:30\" -> \"07:30\"), otherwise null; " +
  "'days' are the weekdays it's for (\"Mon\"..\"Sun\") only if the request says so, otherwise []. " +
  "Return JSON: { title, kind, time, days, steps: [{ label, say, symbolSearch, minutes }] }.";

function languageLine(language: "en" | "hi") {
  return language === "hi"
    ? "Write the title, labels and any 'say' in simple everyday Hindi (Devanagari). symbolSearch stays in English."
    : "Write in simple Indian English.";
}

function schemaFor(kind: Kind | null) {
  const [min, max] = kind ? STEP_LIMITS[kind] : [2, 16];
  return z.object({
    title: z.string().trim().min(1).max(80),
    kind: z.enum(KINDS).optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    days: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).max(7).optional(),
    steps: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(60),
          say: z.string().trim().max(200).nullable().optional(),
          symbolSearch: z.string().trim().min(1).max(60),
          minutes: z.number().int().min(1).max(120).nullable().optional()
        })
      )
      .min(min)
      .max(max)
  });
}

export type Drafted = { title: string; kind: Kind; time: string | null; days: string[]; steps: Step[] };

/** From what a therapist typed, or a parent typed or said (audio). Kind: given, or the AI picks. */
export async function draftScheduleWithAi(input: {
  kidName: string;
  kind: Kind | null;
  language: "en" | "hi";
  request?: string;
  audio?: { mimeType: string; base64: string };
  tenantId: string;
  featureId?: string;
}): Promise<Drafted | null> {
  const featureId = input.featureId ?? "visual-schedule-draft";
  const asked = input.audio ? "(in the attached audio: what the parent said they want)" : input.request;
  const content: AiContentPart[] = [{ type: "text", text: `${languageLine(input.language)}\n\n${JSON.stringify({ childFirstName: input.kidName, kind: input.kind, asked })}` }];
  if (input.audio) content.push({ type: "audio", mimeType: input.audio.mimeType, data: { base64: input.audio.base64 } });
  const result = await orchestrator.executeStructured({
    name: `pravnyaadmin.${featureId}`,
    // Claude doesn't take audio.
    provider: input.audio ? "gemini" : undefined,
    request: {
      systemPrompt: PROMPT,
      messages: [{ role: "user", content }],
      executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId: input.tenantId, featureId })
    },
    schema: schemaFor(input.kind),
    maxRepairAttempts: 1
  });
  if (!result.success) return null;
  const kind = input.kind ?? result.value.kind ?? (result.value.steps.length === 2 ? "FIRST_THEN" : "ROUTINE");
  const [min, max] = STEP_LIMITS[kind];
  if (result.value.steps.length < min || result.value.steps.length > max) return null;
  return {
    title: result.value.title,
    kind,
    time: result.value.time ?? null,
    days: result.value.days ?? [],
    steps: result.value.steps.map((s) => {
      const symbol = bestSymbol(s.symbolSearch) ?? (input.language === "en" ? bestSymbol(s.label) : null);
      return { key: randomUUID(), label: s.label, say: s.say || null, minutes: s.minutes ?? null, picture: symbol ? { kind: "symbol" as const, symbolId: symbol.id } : null };
    })
  };
}
