import type { Activity, Plan } from "./homeSessions.schemas";

// The session runs from the therapist's plan, not from the model: this file decides every step
// (which activity, item and try comes next, when to move on). The AI only interprets what a parent
// types or says into one of these choices, and answers side questions (homeSessions.ai.ts).

export type Language = "en" | "hi";
export type Phase = "intro" | "setup" | "trial" | "help" | "done";

export type RunState = {
  plan: Plan;
  language: Language;
  kidName: string;
  phase: Phase;
  a: number; // activity
  i: number; // item within the activity
  t: number; // try within the item
  misses: number; // misses in a row on this item
  feedback: string | null; // shown at the top of the next step
};

export type TrialRecord = {
  activityKey: string;
  goalId: string;
  goalItemId: string;
  itemLabel: string;
  outcome: "CORRECT" | "INCORRECT";
  supportLevel: string;
  modality: string;
  at: string;
};

export type Choice = { id: string; label: string };
export type StepView = {
  phase: Phase;
  activityTitle: string | null;
  item: string | null;
  lines: string[];
  choices: Choice[];
  progress: { done: number; total: number };
};

const HELP_LABEL: Record<Language, Record<string, string>> = {
  en: {
    VISUAL_PROMPT: "Showed a picture or cue",
    GESTURAL_PROMPT: "Pointed or gestured",
    VERBAL_PROMPT: "Gave a spoken hint",
    PHYSICAL_PROMPT: "Gave hands-on help",
    PARTIAL_ASSISTANCE: "Helped with part of it",
    FULL_ASSISTANCE: "Did it together, fully helped"
  },
  hi: {
    VISUAL_PROMPT: "तस्वीर या इशारा दिखाया",
    GESTURAL_PROMPT: "उंगली से दिखाया",
    VERBAL_PROMPT: "बोलकर हिंट दिया",
    PHYSICAL_PROMPT: "हाथ से मदद की",
    PARTIAL_ASSISTANCE: "थोड़े हिस्से में मदद की",
    FULL_ASSISTANCE: "पूरा साथ में करवाया"
  }
};

const P = {
  en: {
    introTail: "Tap \"We're ready\" when you're both sitting together.",
    ready: "We're ready",
    readyActivity: "Ready",
    skip: "Skip this activity",
    own: (k: string) => `${k} did it on their own`,
    help: "With help",
    notYet: "Not yet",
    back: "Back",
    activity: (n: number, total: number, title: string) => `Activity ${n} of ${total}: ${title}`,
    reward: (r: string) => `Reward right after each good try: ${r}`,
    correctWhen: (c: string) => `It counts when: ${c}`,
    tryOf: (item: string, t: number, total: number) => `${item}: try ${t} of ${total}`,
    wait: "Then wait quietly for about 5 seconds.",
    ifHelp: (s: string) => `If they need help: ${s}`,
    whatHelp: "What help did you give?",
    great: (r: string) => `Great! Reward it right away: ${r}`,
    goodHelp: "Good. Reward it, and next time try a little less help.",
    movingOn: "That one's hard right now. Let's move on to the next one.",
    skipped: "Skipped. On to the next activity.",
    summaryTitle: "How it went:",
    summaryLine: (title: string, n: number, own: number, help: number, miss: number) => `${title}: ${n} tries, ${own} on their own, ${help} with help, ${miss} not yet.`,
    nothingLogged: "No tries were logged."
  },
  hi: {
    introTail: "जब आप दोनों साथ बैठ जाएं, तो \"हम तैयार हैं\" दबाइए।",
    ready: "हम तैयार हैं",
    readyActivity: "तैयार",
    skip: "यह गतिविधि छोड़ें",
    own: (k: string) => `${k} ने खुद किया`,
    help: "मदद से किया",
    notYet: "अभी नहीं",
    back: "वापस",
    activity: (n: number, total: number, title: string) => `गतिविधि ${n} / ${total}: ${title}`,
    reward: (r: string) => `हर अच्छी कोशिश के तुरंत बाद इनाम: ${r}`,
    correctWhen: (c: string) => `सही तब माना जाएगा जब: ${c}`,
    tryOf: (item: string, t: number, total: number) => `${item}: कोशिश ${t} / ${total}`,
    wait: "फिर करीब 5 सेकंड चुपचाप इंतज़ार कीजिए।",
    ifHelp: (s: string) => `अगर मदद चाहिए: ${s}`,
    whatHelp: "आपने क्या मदद दी?",
    great: (r: string) => `बहुत बढ़िया! तुरंत इनाम दीजिए: ${r}`,
    goodHelp: "अच्छा। इनाम दीजिए, और अगली बार थोड़ी कम मदद से कोशिश कीजिए।",
    movingOn: "यह अभी मुश्किल है। अगले पर चलते हैं।",
    skipped: "छोड़ दिया। अगली गतिविधि पर चलते हैं।",
    summaryTitle: "कैसा रहा:",
    summaryLine: (title: string, n: number, own: number, help: number, miss: number) => `${title}: ${n} कोशिशें, ${own} खुद से, ${help} मदद से, ${miss} अभी नहीं।`,
    nothingLogged: "कोई कोशिश दर्ज नहीं हुई।"
  }
};

export function totalTrials(plan: Plan) {
  return plan.activities.reduce((n, a) => n + a.items.length * a.trialsPerItem, 0);
}

function position(s: RunState) {
  let done = 0;
  for (let x = 0; x < s.a && x < s.plan.activities.length; x++) done += s.plan.activities[x].items.length * s.plan.activities[x].trialsPerItem;
  const act = s.plan.activities[s.a];
  if (act && (s.phase === "trial" || s.phase === "help")) done += s.i * act.trialsPerItem + s.t;
  return Math.min(done, totalTrials(s.plan));
}

export function startState(plan: Plan, language: Language, kidName: string): RunState {
  return { plan, language, kidName, phase: "intro", a: 0, i: 0, t: 0, misses: 0, feedback: null };
}

function helpChoices(act: Activity, language: Language): Choice[] {
  const levels = [...new Set(act.prompts.map((p) => p.supportLevel))];
  return levels.map((l) => ({ id: `help:${l}`, label: HELP_LABEL[language][l] }));
}

export function view(s: RunState): StepView {
  const p = P[s.language];
  const act = s.plan.activities[s.a];
  const progress = { done: s.phase === "done" ? totalTrials(s.plan) : position(s), total: totalTrials(s.plan) };
  const fb = s.feedback ? [s.feedback] : [];
  switch (s.phase) {
    case "intro":
      return { phase: "intro", activityTitle: null, item: null, lines: [s.plan.intro, p.introTail], choices: [{ id: "ready", label: p.ready }], progress };
    case "setup":
      return {
        phase: "setup",
        activityTitle: act.goalTitle,
        item: null,
        lines: [...fb, p.activity(s.a + 1, s.plan.activities.length, act.goalTitle), act.setup, p.correctWhen(act.correctLooksLike), p.reward(act.reinforcement)],
        choices: [
          { id: "ready", label: p.readyActivity },
          { id: "skip", label: p.skip }
        ],
        progress
      };
    case "trial": {
      const item = act.items[s.i].label;
      return {
        phase: "trial",
        activityTitle: act.goalTitle,
        item,
        lines: [...fb, p.tryOf(item, s.t + 1, act.trialsPerItem), act.instruction.replace(/\{item\}/g, item), p.wait, p.ifHelp(act.prompts[0].say.replace(/\{item\}/g, item))],
        choices: [
          { id: "own", label: p.own(s.kidName) },
          { id: "help", label: p.help },
          { id: "notyet", label: p.notYet },
          { id: "skip", label: p.skip }
        ],
        progress
      };
    }
    case "help":
      return {
        phase: "help",
        activityTitle: act.goalTitle,
        item: act.items[s.i].label,
        lines: [p.whatHelp],
        choices: [...helpChoices(act, s.language), { id: "back", label: p.back }],
        progress
      };
    case "done":
      return { phase: "done", activityTitle: null, item: null, lines: [...fb, s.plan.closing], choices: [], progress };
  }
}

/** The choices the parent can make right now (what the AI may map free text onto). */
export function choiceIds(s: RunState) {
  return view(s).choices.map((c) => c.id);
}

function nextActivity(s: RunState): RunState {
  const a = s.a + 1;
  if (a >= s.plan.activities.length) return { ...s, phase: "done", a, i: 0, t: 0, misses: 0 };
  return { ...s, phase: "setup", a, i: 0, t: 0, misses: 0 };
}

function advance(s: RunState, movedOn: boolean): RunState {
  const act = s.plan.activities[s.a];
  if (!movedOn && s.t + 1 < act.trialsPerItem) return { ...s, phase: "trial", t: s.t + 1 };
  if (s.i + 1 < act.items.length) return { ...s, phase: "trial", i: s.i + 1, t: 0, misses: 0 };
  return nextActivity(s);
}

export class InvalidChoice extends Error {}

/** Applies one choice. Returns the new state and, for a try, the record to log. */
export function apply(s: RunState, choice: string, now = new Date()): { state: RunState; record: TrialRecord | null } {
  if (!choiceIds(s).includes(choice)) throw new InvalidChoice(`"${choice}" isn't an option right now`);
  const p = P[s.language];
  const act = s.plan.activities[s.a];
  const clear = { ...s, feedback: null };

  if (s.phase === "intro") return { state: { ...clear, phase: "setup" }, record: null };
  if (choice === "skip") return { state: { ...nextActivity(clear), feedback: p.skipped }, record: null };
  if (s.phase === "setup") return { state: { ...clear, phase: "trial" }, record: null };
  if (choice === "help") return { state: { ...clear, phase: "help" }, record: null };
  if (choice === "back") return { state: { ...clear, phase: "trial" }, record: null };

  const item = act.items[s.i];
  const base = { activityKey: act.key, goalId: act.goalId, goalItemId: item.goalItemId, itemLabel: item.label, modality: act.modality, at: now.toISOString() };
  if (choice === "own") {
    const next = advance({ ...clear, misses: 0 }, false);
    return { state: { ...next, feedback: p.great(act.reinforcement) }, record: { ...base, outcome: "CORRECT", supportLevel: "INDEPENDENT" } };
  }
  if (choice.startsWith("help:")) {
    const next = advance({ ...clear, misses: 0 }, false);
    return { state: { ...next, feedback: p.goodHelp }, record: { ...base, outcome: "CORRECT", supportLevel: choice.slice(5) } };
  }
  // notyet
  const misses = s.misses + 1;
  const movedOn = misses >= act.missesBeforeMovingOn;
  const next = advance({ ...clear, misses }, movedOn);
  const feedback = [act.errorCorrection.replace(/\{item\}/g, item.label), movedOn ? p.movingOn : null].filter(Boolean).join(" ");
  return { state: { ...next, feedback }, record: { ...base, outcome: "INCORRECT", supportLevel: "UNKNOWN" } };
}

/** Plain-language summary of a run, per activity. */
export function summarize(plan: Plan, results: TrialRecord[], language: Language) {
  const p = P[language];
  const lines = plan.activities
    .map((a) => {
      const r = results.filter((x) => x.activityKey === a.key);
      if (!r.length) return null;
      const own = r.filter((x) => x.outcome === "CORRECT" && x.supportLevel === "INDEPENDENT").length;
      const help = r.filter((x) => x.outcome === "CORRECT" && x.supportLevel !== "INDEPENDENT").length;
      return p.summaryLine(a.goalTitle, r.length, own, help, r.length - own - help);
    })
    .filter((l): l is string => !!l);
  return lines.length ? [p.summaryTitle, ...lines].join("\n") : p.nothingLogged;
}
