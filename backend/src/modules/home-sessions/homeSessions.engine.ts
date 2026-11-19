import type { Activity, Plan } from "./homeSessions.schemas";

// The session runs from the therapist's plan, not from the model: this file decides every step.
// Each activity is explain -> (the parent and child do it, phone down) -> report: the parent marks
// every try in one go. The AI only turns what a parent types or says into a choice or a filled-in
// report for the parent to check, and answers side questions (homeSessions.ai.ts).

export type Language = "en" | "hi";
export type Phase = "intro" | "explain" | "report" | "done";
/** Runs started before the explain/report flow; they carry on from the current activity. */
type LegacyPhase = "setup" | "trial" | "help";

export type RunState = {
  plan: Plan;
  language: Language;
  kidName: string;
  phase: Phase | LegacyPhase;
  a: number; // activity
  i?: number; // legacy
  t?: number; // legacy
  misses?: number; // legacy
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

/** How one activity is done, laid out for the explain card (and kept on the report screen). */
export type Guide = {
  setup: string;
  say: string;
  countsWhen: string;
  helps: string[];
  ifMiss: string;
  reward: string;
  /** "Ball, Cup: 3 tries each" */
  plan: string;
  moveOn: string;
};

export type TryMark = "own" | "help" | "notyet" | "none";
export type ReportForm = {
  items: { goalItemId: string; label: string }[];
  triesPerItem: number;
  /** The kinds of help this activity uses, least first (asked when any try was "with help"). */
  helps: Choice[];
};
export type Report = { items: { goalItemId: string; tries: TryMark[] }[]; help: string | null };

export type StepView = {
  phase: Phase;
  activityTitle: string | null;
  /** "Activity 1 of 3" */
  activityLabel: string | null;
  /** How the last activity went (or that it was skipped), said before this step. */
  feedback: string | null;
  item: string | null;
  lines: string[];
  guide: Guide | null;
  report: ReportForm | null;
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
    introTail: "For each activity I'll explain what to do. Then put the phone down and play together, and tell me afterwards how it went.",
    ready: "We're ready",
    start: "Got it, let's start",
    skip: "Skip this activity",
    activity: (n: number, total: number) => `Activity ${n} of ${total}`,
    helpLine: (s: string) => `If they need help: ${s}`,
    plan: (items: string, n: number) => (n === 1 ? `${items}: 1 try each` : `${items}: ${n} tries each`),
    moveOn: (n: number) => `If an item is missed ${n === 1 ? "once" : `${n} times in a row`}, move on to the next one.`,
    say: (s: string) => `Each try: ${s}`,
    countsWhen: (s: string) => `It counts when: ${s}`,
    ifMiss: (s: string) => `If they miss: ${s}`,
    reward: (r: string) => `Reward right after each good try: ${r}`,
    reportAsk: (title: string) => `How did "${title}" go?`,
    reportHow: "Mark each try, or just tell me, like \"ball 2 of 3, cup with help\".",
    allOwn: (k: string) => `Wonderful, ${k} did every try on their own!`,
    mostlyOwn: "Good work! Keep the rewards quick and happy.",
    helped: "Good. Next time, try a little less help.",
    hard: "Those were hard today, and that's fine. Next time, give help sooner so it ends on a success.",
    skipped: "Skipped. On to the next activity.",
    notDone: "No tries marked, so I've skipped this one.",
    summaryTitle: "How it went:",
    summaryLine: (title: string, n: number, own: number, help: number, miss: number) => `${title}: ${n} tries, ${own} on their own, ${help} with help, ${miss} not yet.`,
    nothingLogged: "No tries were logged."
  },
  hi: {
    introTail: "हर गतिविधि से पहले मैं बताऊँगी कि क्या करना है। फिर फ़ोन रखकर साथ में खेलिए, और बाद में बताइए कि कैसा रहा।",
    ready: "हम तैयार हैं",
    start: "समझ गए, शुरू करें",
    skip: "यह गतिविधि छोड़ें",
    activity: (n: number, total: number) => `गतिविधि ${n} / ${total}`,
    helpLine: (s: string) => `अगर मदद चाहिए: ${s}`,
    plan: (items: string, n: number) => `${items}: हर एक ${n} बार`,
    moveOn: (n: number) => `अगर कोई चीज़ लगातार ${n} बार न हो, तो अगली पर चलिए।`,
    say: (s: string) => `हर कोशिश: ${s}`,
    countsWhen: (s: string) => `सही तब माना जाएगा जब: ${s}`,
    ifMiss: (s: string) => `अगर न हो पाए: ${s}`,
    reward: (r: string) => `हर अच्छी कोशिश के तुरंत बाद इनाम: ${r}`,
    reportAsk: (title: string) => `"${title}" कैसा रहा?`,
    reportHow: "हर कोशिश पर निशान लगाइए, या बस बताइए, जैसे \"बॉल 3 में से 2, कप मदद से\"।",
    allOwn: (k: string) => `बहुत बढ़िया, ${k} ने हर कोशिश खुद की!`,
    mostlyOwn: "अच्छा काम! इनाम जल्दी और खुशी से देते रहिए।",
    helped: "अच्छा। अगली बार थोड़ी कम मदद से कोशिश कीजिए।",
    hard: "आज ये मुश्किल थे, कोई बात नहीं। अगली बार जल्दी मदद दीजिए ताकि अंत सफलता पर हो।",
    skipped: "छोड़ दिया। अगली गतिविधि पर चलते हैं।",
    notDone: "कोई कोशिश नहीं लगी, इसलिए यह गतिविधि छोड़ दी।",
    summaryTitle: "कैसा रहा:",
    summaryLine: (title: string, n: number, own: number, help: number, miss: number) => `${title}: ${n} कोशिशें, ${own} खुद से, ${help} मदद से, ${miss} अभी नहीं।`,
    nothingLogged: "कोई कोशिश दर्ज नहीं हुई।"
  }
};

/** "{item}" in the plan's wording becomes the item (or, before the tries start, the list of items). */
export function fillItem(text: string, item: string) {
  return text.replace(/\{item\}/g, item);
}

export function totalTrials(plan: Plan) {
  return plan.activities.reduce((n, a) => n + a.items.length * a.trialsPerItem, 0);
}

function triesBefore(plan: Plan, a: number) {
  return plan.activities.slice(0, a).reduce((n, x) => n + x.items.length * x.trialsPerItem, 0);
}

export function startState(plan: Plan, language: Language, kidName: string): RunState {
  return { plan, language, kidName, phase: "intro", a: 0, feedback: null };
}

/** A run saved by the old one-try-at-a-time flow picks up at the explain step of its activity. */
export function normalize(s: RunState): RunState & { phase: Phase } {
  if (s.phase === "setup" || s.phase === "trial" || s.phase === "help") return { plan: s.plan, language: s.language, kidName: s.kidName, phase: "explain", a: s.a, feedback: s.feedback };
  return s as RunState & { phase: Phase };
}

function guideFor(act: Activity, language: Language): Guide {
  const p = P[language];
  const all = act.items.map((x) => x.label).join(", ");
  return {
    setup: fillItem(act.setup, all),
    say: fillItem(act.instruction, all),
    countsWhen: fillItem(act.correctLooksLike, act.items.map((x) => x.label).join(" / ")),
    helps: act.prompts.map((h) => `${HELP_LABEL[language][h.supportLevel]}: ${fillItem(h.say, all)}`),
    ifMiss: fillItem(act.errorCorrection, all),
    reward: act.reinforcement,
    plan: p.plan(all, act.trialsPerItem),
    moveOn: p.moveOn(act.missesBeforeMovingOn)
  };
}

function helpChoices(act: Activity, language: Language): Choice[] {
  const levels = [...new Set(act.prompts.map((p) => p.supportLevel))];
  return levels.map((l) => ({ id: l, label: HELP_LABEL[language][l] }));
}

export function view(state: RunState): StepView {
  const s = normalize(state);
  const p = P[s.language];
  const act = s.plan.activities[s.a];
  const total = totalTrials(s.plan);
  const progress = { done: s.phase === "done" ? total : Math.min(triesBefore(s.plan, s.a), total), total };
  const fb = s.feedback ? [s.feedback] : [];
  const none = { activityTitle: null, activityLabel: null, item: null, guide: null, report: null, feedback: s.feedback };
  switch (s.phase) {
    case "intro":
      return { ...none, phase: "intro", lines: [s.plan.intro, p.introTail], choices: [{ id: "ready", label: p.ready }], progress };
    case "explain": {
      const g = guideFor(act, s.language);
      return {
        phase: "explain",
        activityTitle: act.goalTitle,
        activityLabel: p.activity(s.a + 1, s.plan.activities.length),
        feedback: s.feedback,
        item: null,
        // What Pravnya reads aloud, in order.
        lines: [...fb, `${p.activity(s.a + 1, s.plan.activities.length)}: ${act.goalTitle}.`, g.setup, p.say(g.say), p.countsWhen(g.countsWhen), p.helpLine(g.helps[0]), p.ifMiss(g.ifMiss), p.reward(g.reward), `${g.plan}. ${g.moveOn}`],
        guide: g,
        report: null,
        choices: [
          { id: "start", label: p.start },
          { id: "skip", label: p.skip }
        ],
        progress
      };
    }
    case "report":
      return {
        phase: "report",
        activityTitle: act.goalTitle,
        activityLabel: p.activity(s.a + 1, s.plan.activities.length),
        feedback: null,
        item: null,
        lines: [p.reportAsk(act.goalTitle), p.reportHow],
        guide: guideFor(act, s.language),
        report: { items: act.items, triesPerItem: act.trialsPerItem, helps: helpChoices(act, s.language) },
        choices: [{ id: "skip", label: p.skip }],
        progress
      };
    case "done":
      return { ...none, phase: "done", lines: [...fb, s.plan.closing], choices: [], progress };
  }
}

/** The choices the parent can make right now (what the AI may map free text onto). */
export function choiceIds(s: RunState) {
  return view(s).choices.map((c) => c.id);
}

function nextActivity(s: RunState, feedback: string | null): RunState {
  const a = s.a + 1;
  return { ...s, phase: a >= s.plan.activities.length ? "done" : "explain", a, feedback };
}

export class InvalidChoice extends Error {}

/** Applies a tapped choice (ready, start, skip). Tries are only ever logged through a report. */
export function apply(state: RunState, choice: string): { state: RunState } {
  const s = normalize(state);
  if (!choiceIds(s).includes(choice)) throw new InvalidChoice(`"${choice}" isn't an option right now`);
  const clear = { ...s, feedback: null };
  if (s.phase === "intro") return { state: { ...clear, phase: "explain" } };
  if (choice === "skip") return { state: nextActivity(clear, P[s.language].skipped) };
  return { state: { ...clear, phase: "report" } }; // start
}

/** Checks a report against the current activity: known items, no more tries than planned, a known help. */
export function checkReport(state: RunState, report: Report): string | null {
  const s = normalize(state);
  if (s.phase !== "report") return "There's nothing to report right now";
  const act = s.plan.activities[s.a];
  const ids = new Set(act.items.map((i) => i.goalItemId));
  if (report.items.some((r) => !ids.has(r.goalItemId))) return "That item isn't part of this activity";
  if (new Set(report.items.map((r) => r.goalItemId)).size !== report.items.length) return "Each item can only be reported once";
  if (report.items.some((r) => r.tries.length > act.trialsPerItem)) return `At most ${act.trialsPerItem} tries per item`;
  if (report.help && !act.prompts.some((p) => p.supportLevel === report.help)) return "That kind of help isn't part of this activity";
  return null;
}

/** Applies the parent's report for the current activity: one record per marked try, then on to the next activity. */
export function applyReport(state: RunState, report: Report, now = new Date()): { state: RunState; records: TrialRecord[] } {
  const problem = checkReport(state, report);
  if (problem) throw new InvalidChoice(problem);
  const s = normalize(state);
  const p = P[s.language];
  const act = s.plan.activities[s.a];
  const records: TrialRecord[] = [];
  // In the plan's item order, so the therapist's report reads naturally.
  for (const item of act.items) {
    const marks = report.items.find((r) => r.goalItemId === item.goalItemId)?.tries ?? [];
    for (const mark of marks) {
      if (mark === "none") continue;
      records.push({
        activityKey: act.key,
        goalId: act.goalId,
        goalItemId: item.goalItemId,
        itemLabel: item.label,
        outcome: mark === "notyet" ? "INCORRECT" : "CORRECT",
        supportLevel: mark === "own" ? "INDEPENDENT" : mark === "help" ? (report.help ?? "UNKNOWN") : "UNKNOWN",
        modality: act.modality,
        // A millisecond apart so they keep their order.
        at: new Date(now.getTime() + records.length).toISOString()
      });
    }
  }
  if (!records.length) return { state: nextActivity(s, p.notDone), records };
  const own = records.filter((r) => r.supportLevel === "INDEPENDENT").length;
  const miss = records.filter((r) => r.outcome === "INCORRECT").length;
  const feedback = own === records.length ? p.allOwn(s.kidName) : miss > records.length / 2 ? p.hard : own >= records.length / 2 ? p.mostlyOwn : p.helped;
  return { state: nextActivity(s, feedback), records };
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
