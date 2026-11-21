import { GoogleGenAI, Modality, Type, type FunctionDeclaration, type LiveConnectConfig } from "@google/genai";
import { env } from "../../config/env";
import { HELP_LEVELS } from "./homeSessions.schemas";
import { fillItem, normalize, view, type RunState } from "./homeSessions.engine";

// "Call Pravnya": the home session as a hands-free voice call. The parent's phone talks straight to
// Gemini's Live API with a short-lived token this file mints. The token locks the model, Pravnya's
// instructions and the session tools, so the browser can't change them and never sees our API key.
// The plan still decides every step: the model can only move the session on through the tools
// below, which the app carries out against the same engine (turn / report) as the tap-through flow.

export const CALL_TOKEN_MINUTES = 30;
/** Calls (and reconnects) per run: keeps a stuck phone from running up the bill. */
export const MAX_CALLS_PER_RUN = 8;

export const CALL_TOOLS: FunctionDeclaration[] = [
  {
    name: "ready_for_activity",
    description: "Call when the parent says they are sitting together and ready, during the introduction. Returns the first activity to explain."
  },
  {
    name: "start_playing",
    description:
      "Call after you have explained the current activity and the parent says they're ready to start it. From then on, listen and count each try with record_try. Returns the items and tries per item."
  },
  {
    name: "record_try",
    description:
      "Record one try as the parent describes it (e.g. 'got it', 'no', 'with help', 'he said cup'). One call per try, in order. Only call it for tries the parent actually tells you about.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        item: { type: Type.STRING, description: "The item practised, exactly as named in the activity (e.g. 'Ball')." },
        result: { type: Type.STRING, enum: ["own", "help", "notyet"], description: "own = did it on their own; help = did it with help; notyet = didn't get it." },
        help: { type: Type.STRING, enum: [...HELP_LEVELS], description: "If result is help and you know what help was given." }
      },
      required: ["item", "result"]
    }
  },
  {
    name: "undo_last_try",
    description: "Remove the last recorded try, when the parent corrects themselves."
  },
  {
    name: "save_activity",
    description:
      "Call when the parent is finished with the current activity and has confirmed the tally you read back. Saves the tries and returns the next activity to explain (or the end of the session)."
  },
  {
    name: "skip_activity",
    description: "Call when the parent wants to skip the current activity. Returns the next one."
  },
  {
    name: "end_session",
    description: "Call only when the parent clearly wants to stop the whole session, after checking with them. Anything already saved is kept."
  }
];

const RULES =
  "Rules, always: no diagnosis, no medical or medication advice, no promises about results; never suggest force, restraint, punishment, or withholding food, " +
  "water, comfort or the toilet. If the child is upset, tired or distressed, say it's fine to pause or stop and end on something easy. For anything about health, " +
  "injury, choking, seizures or safety, tell the parent to stop the session and contact their doctor or therapist (emergency services if urgent). " +
  "Never invent what the child did: only record tries the parent tells you about.";

/** Pravnya's instructions for this call: who she is, the whole plan, and where the session is now. */
export function callInstruction(state: RunState) {
  const s = normalize(state);
  const step = view(s);
  const hindi = s.language === "hi";
  const activities = s.plan.activities.map((a, n) => {
    const all = a.items.map((i) => i.label).join(", ");
    return {
      number: n + 1,
      goal: a.goalTitle,
      items: a.items.map((i) => i.label),
      triesPerItem: a.trialsPerItem,
      setup: fillItem(a.setup, all),
      eachTry: fillItem(a.instruction, all),
      countsWhen: fillItem(a.correctLooksLike, all),
      helpsLeastFirst: a.prompts.map((p) => ({ help: p.supportLevel, say: fillItem(p.say, all) })),
      ifTheyMiss: fillItem(a.errorCorrection, all),
      reward: a.reinforcement,
      moveOnAfterMissesInARow: a.missesBeforeMovingOn
    };
  });
  return [
    `You are Pravnya, a warm, calm guide on a voice call with a parent who is doing a short therapy practice session at home with their child, ${s.kidName}. ` +
      "The phone is propped up nearby while they play, so speak like a friendly therapist on a call: short, clear sentences, one idea at a time, then stop and let them talk. " +
      (hindi
        ? "Speak natural, everyday Hindi, as a therapist in India would to a parent. Keep the item names as given. If the parent switches to English, you may too."
        : "Speak simple Indian English. If the parent speaks Hindi, answer in Hindi."),
    "How the call goes, for each activity in order:\n" +
      "1. Explain it briefly: what to get ready, what to say each try, what counts, the first help to try, and the reward. Ask if they have questions. Don't read the whole thing at once.\n" +
      "2. When they're ready, call start_playing, tell them to go ahead, and then mostly stay quiet while they play. A few words of encouragement are fine.\n" +
      "3. As they tell you how each try went, call record_try (one call per try) and acknowledge in a word or two (\"Lovely!\", \"OK, with help\"). If a try was with help and you don't know which help, you may ask briefly. " +
      "Remind them of the next help if the child is missing, and to move on after the planned misses in a row.\n" +
      "4. When they're done, read back the tally (for example \"Ball: 2 of 3 on his own, Cup: 1 with help\") and ask if that's right. Fix it with undo_last_try and record_try if not. " +
      "Then call save_activity and move on to the next activity it returns.\n" +
      "If they want to skip an activity, call skip_activity. When save_activity or skip_activity says the session is done, thank them warmly, say something specific that went well, and say goodbye.\n" +
      "The app decides the order: only move on using the tools, and follow what each tool returns. If a tool returns an error, tell the parent simply and carry on.",
    RULES,
    `The plan for today: ${JSON.stringify({ intro: s.plan.intro, activities, closing: s.plan.closing })}`,
    step.phase === "intro"
      ? "Right now: the call has just started. Greet the parent, say in a sentence what you'll practise today, and ask them to tell you when they're sitting together. Then call ready_for_activity."
      : step.phase === "explain"
        ? `Right now: activity ${s.a + 1} ("${step.activityTitle}") is next. Greet the parent and explain it.`
        : step.phase === "report"
          ? `Right now: they're in the middle of activity ${s.a + 1} ("${step.activityTitle}"), and no tries have been saved for it yet. Greet the parent and ask how it's going; record tries as they tell you.`
          : "Right now: the session is finished. Thank the parent and say goodbye."
  ].join("\n\n");
}

export function callConfig(state: RunState): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: callInstruction(state),
    tools: [{ functionDeclarations: CALL_TOOLS }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {}
  };
}

/** Test-only: the last token request, so tests can check what was locked in. */
export let lastTokenRequest: { model: string; config: LiveConnectConfig } | null = null;

/** A one-use token for one call, locked to the model and this config. Null when calls aren't set up. */
export async function mintCallToken(config: LiveConnectConfig, now = new Date()): Promise<{ token: string; model: string; apiVersion: string; expiresAt: string } | null> {
  const model = env.GEMINI_LIVE_MODEL;
  const apiVersion = env.GEMINI_LIVE_API_VERSION;
  const expiresAt = new Date(now.getTime() + CALL_TOKEN_MINUTES * 60_000).toISOString();
  if (env.NODE_ENV === "test") {
    lastTokenRequest = { model, config };
    return { token: "auth_tokens/test-call-token", model, apiVersion, expiresAt };
  }
  if (!env.GEMINI_API_KEY) return null;
  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { apiVersion } });
  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime: expiresAt,
      newSessionExpireTime: new Date(now.getTime() + 2 * 60_000).toISOString(),
      // Everything in the constraints is locked: the phone can't swap the instructions or tools.
      liveConnectConstraints: { model, config }
    }
  });
  if (!token.name) return null;
  return { token: token.name, model, apiVersion, expiresAt };
}
