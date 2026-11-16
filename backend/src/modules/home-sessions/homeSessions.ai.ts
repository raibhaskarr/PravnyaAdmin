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

export async function draftPlanWithAi(kidName: string, goals: GoalForDraft[], language: Language, tenantId: string, featureId = "home-session-draft"): Promise<Plan | null> {
  const result = await orchestrator.executeStructured({
    name: `pravnyaadmin.${featureId}`,
    request: {
      systemPrompt: DRAFT_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: `${languageLine(language)}\n\n${JSON.stringify({ childFirstName: kidName, goals }, null, 1)}` }] }],
      executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId, featureId })
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

type Wording = { setup: string; instruction: string; correctLooksLike: string; prompts: { supportLevel: Activity["prompts"][number]["supportLevel"]; say: string }[]; modality: Activity["modality"] };

/** Sound default wording for each kind of activity, so a plan reads well even without the AI. */
function wordingFor(type: Activity["type"], hi: boolean): Wording {
  const W: Record<Activity["type"], [Wording, Wording]> = {
    RECEPTIVE_ID: [
      {
        setup: "Put {item} and one or two other things on the table in front of your child. Mix up where {item} sits each time.",
        instruction: "Say: \"Show me {item}.\" (or \"Touch {item}\")",
        correctLooksLike: "Your child touches, points to or gives you {item} within about 5 seconds.",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "Look at or point towards {item} and say it again." },
          { supportLevel: "PHYSICAL_PROMPT", say: "Gently guide their hand to {item}." }
        ],
        modality: "GESTURAL"
      },
      {
        setup: "{item} और एक-दो दूसरी चीज़ें बच्चे के सामने रखिए। हर बार {item} की जगह बदलिए।",
        instruction: "कहिए: \"{item} दिखाओ।\"",
        correctLooksLike: "बच्चा करीब 5 सेकंड में {item} को छूए, उसकी ओर इशारा करे या आपको दे।",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "{item} की ओर देखिए या इशारा कीजिए और फिर से कहिए।" },
          { supportLevel: "PHYSICAL_PROMPT", say: "हल्के से बच्चे का हाथ {item} तक ले जाइए।" }
        ],
        modality: "GESTURAL"
      }
    ],
    EXPRESSIVE_LABEL: [
      {
        setup: "Keep {item} (or a picture of it) out of sight, ready to show.",
        instruction: "Hold up {item} and ask: \"What's this?\"",
        correctLooksLike: "Your child says the word (or a clear try at it) within about 5 seconds.",
        prompts: [
          { supportLevel: "VERBAL_PROMPT", say: "Say the first sound of the word." },
          { supportLevel: "VERBAL_PROMPT", say: "Say the whole word and let them copy you." }
        ],
        modality: "VERBAL"
      },
      {
        setup: "{item} (या उसकी तस्वीर) छुपाकर पास रखिए।",
        instruction: "{item} दिखाइए और पूछिए: \"यह क्या है?\"",
        correctLooksLike: "बच्चा करीब 5 सेकंड में शब्द बोले (या साफ़ कोशिश करे)।",
        prompts: [
          { supportLevel: "VERBAL_PROMPT", say: "शब्द की पहली आवाज़ बोलिए।" },
          { supportLevel: "VERBAL_PROMPT", say: "पूरा शब्द बोलिए और दोहराने दीजिए।" }
        ],
        modality: "VERBAL"
      }
    ],
    AAC_LABEL: [
      {
        setup: "Keep your child's AAC device or board in front of them, switched on, with {item} close by.",
        instruction: "Show {item} and ask: \"What's this? Tell me on your talker.\" Wait, without insisting on speech.",
        correctLooksLike: "Your child finds and presses the word for {item} within about 5-10 seconds.",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "Point to the page or button where {item} is." },
          { supportLevel: "VISUAL_PROMPT", say: "Press {item} on the device yourself, then give them a turn." },
          { supportLevel: "PHYSICAL_PROMPT", say: "Gently guide their finger to the button." }
        ],
        modality: "AAC"
      },
      {
        setup: "बच्चे का AAC डिवाइस या बोर्ड चालू करके सामने रखिए, और {item} पास रखिए।",
        instruction: "{item} दिखाइए और पूछिए: \"यह क्या है? डिवाइस पर बताओ।\" बोलने पर ज़ोर मत दीजिए।",
        correctLooksLike: "बच्चा करीब 5-10 सेकंड में {item} का बटन ढूंढकर दबाए।",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "उस पेज या बटन की ओर इशारा कीजिए जहाँ {item} है।" },
          { supportLevel: "VISUAL_PROMPT", say: "पहले खुद डिवाइस पर {item} दबाइए, फिर बच्चे की बारी।" },
          { supportLevel: "PHYSICAL_PROMPT", say: "हल्के से बच्चे की उंगली बटन तक ले जाइए।" }
        ],
        modality: "AAC"
      }
    ],
    ARTICULATION: [
      {
        setup: "Sit face to face at your child's eye level, so they can see your mouth.",
        instruction: "Say \"{item}\" clearly, then: \"Your turn!\"",
        correctLooksLike: "Your child says {item} with the target sound clear enough to understand.",
        prompts: [
          { supportLevel: "VISUAL_PROMPT", say: "Point to your mouth and say the sound slowly." },
          { supportLevel: "VERBAL_PROMPT", say: "Say it in parts, slowly, and let them copy each part." }
        ],
        modality: "VERBAL"
      },
      {
        setup: "बच्चे की आँखों की ऊँचाई पर आमने-सामने बैठिए, ताकि वह आपका मुँह देख सके।",
        instruction: "साफ़ बोलिए \"{item}\", फिर: \"अब तुम्हारी बारी!\"",
        correctLooksLike: "बच्चा {item} बोले और लक्ष्य वाली आवाज़ समझ में आए।",
        prompts: [
          { supportLevel: "VISUAL_PROMPT", say: "अपने मुँह की ओर इशारा करके आवाज़ धीरे से बोलिए।" },
          { supportLevel: "VERBAL_PROMPT", say: "टुकड़ों में धीरे बोलिए और हर टुकड़ा दोहराने दीजिए।" }
        ],
        modality: "VERBAL"
      }
    ],
    REQUESTING: [
      {
        setup: "Keep {item} where your child can see it but can't reach it.",
        instruction: "Hold up {item}, look at your child expectantly and wait. Don't name it first.",
        correctLooksLike: "Your child asks for {item} (a word, a sign or the device) within about 5 seconds. Hand it over right away.",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "Hold {item} a little closer and raise your eyebrows." },
          { supportLevel: "VERBAL_PROMPT", say: "Say the word for {item} and wait for them to copy it." }
        ],
        modality: "VERBAL"
      },
      {
        setup: "{item} ऐसी जगह रखिए जहाँ बच्चा देख सके पर पहुँच न सके।",
        instruction: "{item} दिखाइए, उम्मीद से बच्चे की ओर देखिए और इंतज़ार कीजिए। पहले नाम मत बोलिए।",
        correctLooksLike: "बच्चा करीब 5 सेकंड में {item} माँगे (शब्द, इशारा या डिवाइस से)। तुरंत दे दीजिए।",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "{item} थोड़ा पास लाइए और भौंहें उठाकर इंतज़ार कीजिए।" },
          { supportLevel: "VERBAL_PROMPT", say: "{item} का शब्द बोलिए और दोहराने का इंतज़ार कीजिए।" }
        ],
        modality: "VERBAL"
      }
    ],
    FOLLOW_DIRECTIONS: [
      {
        setup: "Get your child's attention first: say their name and wait for a look.",
        instruction: "Say it once, simply: \"{item}.\"",
        correctLooksLike: "Your child starts doing it within about 5 seconds, without a repeat.",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "Point or show what to do while you say it again." },
          { supportLevel: "PHYSICAL_PROMPT", say: "Gently help them do it, then praise." }
        ],
        modality: "NOT_APPLICABLE"
      },
      {
        setup: "पहले बच्चे का ध्यान लीजिए: नाम लेकर उसके देखने का इंतज़ार कीजिए।",
        instruction: "एक बार, सीधे कहिए: \"{item}।\"",
        correctLooksLike: "बच्चा करीब 5 सेकंड में, बिना दोहराए, करना शुरू करे।",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "दोबारा कहते हुए इशारे से दिखाइए क्या करना है।" },
          { supportLevel: "PHYSICAL_PROMPT", say: "हल्के से करने में मदद कीजिए, फिर तारीफ़ कीजिए।" }
        ],
        modality: "NOT_APPLICABLE"
      }
    ],
    IMITATION: [
      {
        setup: "Sit face to face. Get your child's attention with their name or a fun sound.",
        instruction: "Say \"Do this!\" and show {item}.",
        correctLooksLike: "Your child copies {item} within about 5 seconds.",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "Show it again, slower and bigger." },
          { supportLevel: "PHYSICAL_PROMPT", say: "Gently help them copy it." }
        ],
        modality: "GESTURAL"
      },
      {
        setup: "आमने-सामने बैठिए। नाम या कोई मज़ेदार आवाज़ से ध्यान लीजिए।",
        instruction: "कहिए \"ऐसे करो!\" और {item} करके दिखाइए।",
        correctLooksLike: "बच्चा करीब 5 सेकंड में {item} की नकल करे।",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "फिर से, धीरे और बड़ा करके दिखाइए।" },
          { supportLevel: "PHYSICAL_PROMPT", say: "हल्के से नकल करने में मदद कीजिए।" }
        ],
        modality: "GESTURAL"
      }
    ],
    DISCRETE_TRIAL: [
      {
        setup: "Sit face to face, put distractions away, and keep what you need for {item} within reach.",
        instruction: "Get their attention, then give one short, clear instruction for {item}. Use the same words each time.",
        correctLooksLike: "Your child does {item} within about 5 seconds.",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "Point to or show what to do." },
          { supportLevel: "VERBAL_PROMPT", say: "Show the right response and let them copy you." },
          { supportLevel: "PHYSICAL_PROMPT", say: "Gently guide their hands to help." }
        ],
        modality: "NOT_APPLICABLE"
      },
      {
        setup: "आमने-सामने बैठिए, ध्यान भटकाने वाली चीज़ें हटाइए, और {item} के लिए ज़रूरी चीज़ें पास रखिए।",
        instruction: "ध्यान लीजिए, फिर {item} के लिए एक छोटा, साफ़ निर्देश दीजिए। हर बार वही शब्द।",
        correctLooksLike: "बच्चा करीब 5 सेकंड में {item} करे।",
        prompts: [
          { supportLevel: "GESTURAL_PROMPT", say: "इशारे से दिखाइए क्या करना है।" },
          { supportLevel: "VERBAL_PROMPT", say: "सही जवाब करके दिखाइए और दोहराने दीजिए।" },
          { supportLevel: "PHYSICAL_PROMPT", say: "हल्के से हाथ पकड़कर मदद कीजिए।" }
        ],
        modality: "NOT_APPLICABLE"
      }
    ],
    OTHER: [] as unknown as [Wording, Wording]
  };
  W.OTHER = W.DISCRETE_TRIAL;
  return W[type][hi ? 1 : 0];
}

/** When the AI can't draft: sound wording for each kind of activity, from the goals. */
export function templatePlan(kidName: string, goals: GoalForDraft[], language: Language): Plan {
  const hi = language === "hi";
  return {
    intro: hi
      ? `आज हम ${kidName} के साथ कुछ छोटे खेल करेंगे। इसे मज़ेदार रखिए, और अगर ${kidName} परेशान हो तो रुक जाइए।`
      : `Today we'll practise a few things with ${kidName} as short games. Keep it playful, and stop if ${kidName} gets upset.`,
    closing: hi ? "शाबाश! आज के लिए इतना ही। अब कुछ ऐसा कीजिए जो बच्चे को पसंद हो।" : "Well done, both of you! That's it for today. Finish with something your child enjoys.",
    activities: goals.map((g) => {
      const type = guessType(`${g.title} ${g.skill} ${g.area}`);
      const w = wordingFor(type, hi);
      return {
        key: randomUUID(),
        goalId: g.id,
        goalTitle: g.title,
        type,
        items: g.items.slice(0, 3),
        trialsPerItem: 3,
        setup: w.setup,
        instruction: w.instruction,
        correctLooksLike: w.correctLooksLike,
        prompts: w.prompts,
        errorCorrection: hi ? "शांति से सही जवाब दिखाइए, मदद से दोहराने दीजिए, फिर आगे बढ़िए। \"नहीं\" या डाँट नहीं।" : "Calmly show the right answer, help them copy it, then move on. No \"no!\" or scolding.",
        reinforcement: hi ? "तुरंत तारीफ़ कीजिए (\"शाबाश, तुमने कर दिखाया!\") और कोई पसंदीदा चीज़ दीजिए।" : "Praise right away (\"Yes, you did it!\") and give something they love.",
        modality: w.modality,
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
