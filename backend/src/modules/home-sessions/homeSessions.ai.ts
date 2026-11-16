import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createExecutionContext } from "@pravnix/ai-core";
import type { AiContentPart } from "@pravnix/ai-core";
import { orchestrator } from "../ai/ai.platform";
import { ACTIVITY_TYPES, HELP_LEVELS, RESPONSE_MODALITIES, type Activity, type Plan } from "./homeSessions.schemas";
import type { Language, StepView } from "./homeSessions.engine";

export type GoalForDraft = {
  id: string;
  title: string;
  skill: string;
  area: string;
  measurementType: string | null;
  items: { goalItemId: string; label: string }[];
  /** From the last 30 days of logs. */
  recent: { entries: number; correct: number; independent: number } | null;
};

function languageLine(language: Language) {
  return language === "hi"
    ? "Write every parent-facing string in natural, everyday Hindi (Devanagari), as a therapist in India would speak to a parent. Keep item names as given."
    : "Write in simple Indian English.";
}

// ---------- Drafting a session plan (therapist side) ----------

const DRAFT_PROMPT =
  "You are an experienced paediatric therapist (ABA, speech and language, AAC) planning a short guided practice session " +
  "that a parent will run at home, with an app reading each step to them. You are given the child's first name and the goals " +
  "chosen for this session, each with its skill, area, the items (words, objects, actions) being taught, and recent figures.\n\n" +
  "For each goal, write one activity using best practice:\n" +
  "- type: DISCRETE_TRIAL (ABA trial: clear instruction, response, immediate reward), RECEPTIVE_ID (\"touch/give me the X\" from a field of 2-3), " +
  "EXPRESSIVE_LABEL (\"what's this?\"), AAC_LABEL (child finds and presses the word on their AAC device; the parent models on the device first; never insist on speech), " +
  "ARTICULATION (a sound or word said clearly), REQUESTING (set up a want, pause, child asks), FOLLOW_DIRECTIONS, IMITATION, or OTHER.\n" +
  "- items: choose 1-4 goalItemIds from that goal's list (only ids given).\n" +
  "- trialsPerItem: usually 2-5; keep the whole session around 10-15 minutes and at most 40 tries.\n" +
  "- setup: what to get ready and how to sit (face to face, distractions away, a field of choices for receptive tasks).\n" +
  "- instruction: exactly what the parent says or does to start each try, short and the same every time; write {item} where the item goes.\n" +
  "- correctLooksLike: the observable response that counts, including the response time (about 3-5 seconds).\n" +
  "- prompts: 2-4 helps, LEAST to MOST (visual or gestural, then verbal or model, then physical/hand-over-hand), each with supportLevel " +
  `(${HELP_LEVELS.join(", ")}) and what to say or do (may use {item}).\n` +
  "- errorCorrection: what to do right after a miss: calmly model the right response, give the child a chance to copy with help, then move on; no \"no!\" or scolding.\n" +
  "- reinforcement: an immediate, specific reward (praise naming the skill plus something the child likes), fading as they improve.\n" +
  `- modality: how the child responds (${RESPONSE_MODALITIES.join(", ")}).\n` +
  "- missesBeforeMovingOn: usually 2-3.\n" +
  "Base difficulty and help on the recent figures (few independent -> start with more help). Also write intro (2-3 sentences: what we'll practise, keep it playful, " +
  "stop if the child is upset) and closing (1-2 sentences: thank the parent, end on something the child enjoys).\n\n" +
  "Rules, always: no diagnosis, no promises about results, nothing about medication; never force, restrain or punish; never withhold food, water, comfort " +
  "or the toilet as a consequence (a short pause before handing over something the child asked for is fine). For eating, swallowing or toileting skills, " +
  "keep to simple, safe steps and say to follow the therapist's instructions. Speak to the parent (\"you\", \"your child\" or the child's name).\n\n" +
  'Respond with ONLY JSON, no markdown fences: {"intro": string, "closing": string, "activities": [{"goalId": string, "type": string, "items": [goalItemId strings], ' +
  '"trialsPerItem": number, "setup": string, "instruction": string, "correctLooksLike": string, "prompts": [{"supportLevel": string, "say": string}], ' +
  '"errorCorrection": string, "reinforcement": string, "modality": string, "missesBeforeMovingOn": number}]}. One activity per goal, in the order given.';

function draftSchema(goals: GoalForDraft[]) {
  const goalIds = new Set(goals.map((g) => g.id));
  const itemIds = new Set(goals.flatMap((g) => g.items.map((i) => i.goalItemId)));
  const s = (max: number) => z.string().trim().min(1).max(max);
  return z.object({
    intro: s(500),
    closing: s(400),
    activities: z
      .array(
        z.object({
          goalId: z.string().refine((id) => goalIds.has(id), "Unknown goalId"),
          type: z.enum(ACTIVITY_TYPES),
          items: z.array(z.string().refine((id) => itemIds.has(id), "Unknown goalItemId")).min(1).max(4),
          trialsPerItem: z.number().int().min(1).max(10),
          setup: s(500),
          instruction: s(300),
          correctLooksLike: s(300),
          prompts: z.array(z.object({ supportLevel: z.enum(HELP_LEVELS), say: s(200) })).min(1).max(5),
          errorCorrection: s(400),
          reinforcement: s(200),
          modality: z.enum(RESPONSE_MODALITIES),
          missesBeforeMovingOn: z.number().int().min(1).max(5)
        })
      )
      .min(1)
      .max(6)
  });
}

export async function draftPlanWithAi(kidName: string, goals: GoalForDraft[], language: Language, tenantId: string): Promise<Plan | null> {
  const result = await orchestrator.executeStructured({
    name: "pravnyaadmin.home-session-draft",
    request: {
      systemPrompt: DRAFT_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: `${languageLine(language)}\n\n${JSON.stringify({ childFirstName: kidName, goals }, null, 1)}` }] }],
      executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId, featureId: "home-session-draft" })
    },
    schema: draftSchema(goals),
    maxRepairAttempts: 1
  });
  if (!result.success) return null;
  const byGoal = new Map(goals.map((g) => [g.id, g]));
  const activities: Activity[] = result.value.activities.map((a) => {
    const g = byGoal.get(a.goalId)!;
    const items = [...new Set(a.items)].map((id) => g.items.find((i) => i.goalItemId === id)).filter((i): i is GoalForDraft["items"][number] => !!i);
    return { ...a, key: randomUUID(), goalTitle: g.title, items: items.length ? items : g.items.slice(0, 1) };
  });
  return { intro: result.value.intro, closing: result.value.closing, activities };
}

/** A best guess from the goal, skill and area names; the therapist can change it. */
export function guessType(names: string): Activity["type"] {
  const n = names.toLowerCase();
  const rules: [RegExp, Activity["type"]][] = [
    [/\baac\b|device|communication board/, "AAC_LABEL"],
    [/request|\bmand|asks? for/, "REQUESTING"],
    [/articulat|speech sound|phonolog|pronounc/, "ARTICULATION"],
    [/imitat|copy/, "IMITATION"],
    [/follow|direction|instruction|routine/, "FOLLOW_DIRECTIONS"],
    [/receptive|identif|point to|touch|show me|select/, "RECEPTIVE_ID"],
    [/label|name|expressive|tact/, "EXPRESSIVE_LABEL"]
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? "DISCRETE_TRIAL";
}

/** When the AI can't draft: a sound, general plan from the goals that the therapist then edits. */
export function templatePlan(kidName: string, goals: GoalForDraft[], language: Language): Plan {
  const hi = language === "hi";
  return {
    intro: hi
      ? `आज हम ${kidName} के साथ कुछ छोटे खेल करेंगे। इसे मज़ेदार रखिए, और अगर ${kidName} परेशान हो तो रुक जाइए।`
      : `Today we'll practise a few things with ${kidName} as short games. Keep it playful, and stop if ${kidName} gets upset.`,
    closing: hi ? "शाबाश! आज के लिए इतना ही। अब कुछ ऐसा कीजिए जो बच्चे को पसंद हो।" : "Well done, both of you! That's it for today. Finish with something your child enjoys.",
    activities: goals.map((g) => {
      const type = guessType(`${g.title} ${g.skill} ${g.area}`);
      return {
        key: randomUUID(),
        goalId: g.id,
        goalTitle: g.title,
        type,
        items: g.items.slice(0, 3),
        trialsPerItem: 3,
        setup: hi
          ? "बच्चे के सामने बैठिए, ध्यान भटकाने वाली चीज़ें हटा दीजिए, और ज़रूरी चीज़ें पास रखिए।"
          : "Sit face to face, put distractions away, and keep what you need within reach.",
        instruction: hi ? "{item} के लिए अपना छोटा, साफ़ निर्देश दीजिए।" : "Give your short, clear instruction for {item}.",
        correctLooksLike: hi ? "बच्चा 3-5 सेकंड में सही जवाब दे।" : "Your child responds correctly within 3-5 seconds.",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: hi ? "उंगली से {item} की ओर इशारा कीजिए।" : "Point to or gesture towards {item}." },
          { supportLevel: "VERBAL_PROMPT", say: hi ? "सही जवाब बोलकर दिखाइए और दोहराने दीजिए।" : "Say or show the right answer and let them copy you." },
          { supportLevel: "PHYSICAL_PROMPT", say: hi ? "हल्के से हाथ पकड़कर मदद कीजिए।" : "Gently guide their hands to help." }
        ],
        errorCorrection: hi ? "शांति से सही जवाब दिखाइए, मदद से दोहराने दीजिए, फिर आगे बढ़िए।" : "Calmly show the right answer, help them copy it, then move on.",
        reinforcement: hi ? "तुरंत तारीफ़ कीजिए और कोई पसंदीदा चीज़ दीजिए।" : "Praise right away and give something they love.",
        modality: "VERBAL",
        missesBeforeMovingOn: 2
      };
    })
  };
}

// ---------- During a session (parent side) ----------

const TURN_PROMPT =
  "You are Pravnya, guiding a parent through a short therapy practice session at home with their child, like a calm therapist on a call. " +
  "The app controls the session; you are given the current step (what the parent was just told) and the options the parent can choose. " +
  "The parent has typed or spoken a reply.\n\n" +
  "Decide:\n" +
  "- If the reply tells you which option applies (e.g. \"he said ball by himself\" -> the 'did it on their own' option; \"after I pointed\" -> the help option " +
  "matching a point/gesture; \"no\", \"he didn't\" -> not yet; \"ok\", \"ready\", \"done\" -> ready; \"skip this\" -> skip), return intent \"choice\" with that option's id " +
  "and a very short acknowledgement in reply (or null).\n" +
  "- If the reply says the child got it with help but not which help, choose the generic 'help' option if it's offered.\n" +
  "- Otherwise (a question, a worry, the child is upset, unclear), return intent \"answer\" with choice null and a short, practical reply (1-3 sentences): " +
  "answer within the session's activity; if the child is upset, tired or distressed, say it's fine to pause or stop and end on something easy; " +
  "if it's unclear, ask them to say what the child did or tap a button.\n\n" +
  "Rules, always: no diagnosis, no medical or medication advice, no promises about results; never suggest force, restraint, punishment, or withholding food, water, " +
  "comfort or the toilet. For anything about health, injury, choking, seizures or safety, tell them to stop the session and contact their doctor or therapist " +
  "(emergency services if urgent). Don't invent what the child did.\n\n" +
  'Respond with ONLY JSON: {"intent": "choice" | "answer", "choice": string | null, "reply": string | null}.';

export type TurnInterpretation = { intent: "choice"; choice: string; reply: string | null } | { intent: "answer"; choice: null; reply: string };

export async function interpretTurn(
  step: StepView,
  context: { kidName: string; language: Language; activity: Activity | null },
  input: { text?: string; audio?: { mimeType: string; base64: string } },
  tenantId: string
): Promise<TurnInterpretation | null> {
  const ids = step.choices.map((c) => c.id);
  const schema = z
    .object({ intent: z.enum(["choice", "answer"]), choice: z.string().nullable(), reply: z.string().trim().max(600).nullable() })
    .refine((v) => (v.intent === "choice" ? !!v.choice && ids.includes(v.choice) : !!v.reply), "choice must be one of the options; an answer needs a reply");
  const situation = {
    child: context.kidName,
    activity: context.activity
      ? { goal: context.activity.goalTitle, type: context.activity.type, correctLooksLike: context.activity.correctLooksLike, prompts: context.activity.prompts, errorCorrection: context.activity.errorCorrection }
      : null,
    currentStep: { lines: step.lines, item: step.item },
    options: step.choices
  };
  const content: AiContentPart[] = [{ type: "text", text: `${languageLine(context.language)}\n\n${JSON.stringify(situation, null, 1)}\n\nThe parent's reply${input.audio ? " is in the attached audio." : `: "${input.text}"`}` }];
  if (input.audio) content.push({ type: "audio", mimeType: input.audio.mimeType, data: { base64: input.audio.base64 } });
  const result = await orchestrator.executeStructured({
    name: "pravnyaadmin.home-session-turn",
    request: {
      systemPrompt: TURN_PROMPT,
      messages: [{ role: "user", content }],
      executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId, featureId: "home-session-turn" })
    },
    schema,
    maxRepairAttempts: 1
  });
  if (!result.success) return null;
  const v = result.value;
  return v.intent === "choice" ? { intent: "choice", choice: v.choice!, reply: v.reply } : { intent: "answer", choice: null, reply: v.reply! };
}
