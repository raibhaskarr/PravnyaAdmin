import { api, ApiError, type SessionReport, type SessionStep, type SessionTurnResult, type TryMark } from "../api/client";

// What happens when Pravnya, on a call, uses one of the session tools. The server decides every
// step (the same turn / report endpoints the screens use); this only keeps the tally of tries the
// parent describes until the activity is saved, and tells the model what happened in plain JSON.

export type Tally = { report: SessionReport; history: { row: number; slot: number }[] };

export function emptyTally(step: SessionStep): Tally | null {
  if (step.phase !== "report" || !step.report) return null;
  return { report: { items: step.report.items.map((i) => ({ goalItemId: i.goalItemId, tries: Array<TryMark>(step.report!.triesPerItem).fill("none") })), help: null }, history: [] };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Which item the model means: exact, then contained either way; with a single item, that one. */
export function findItem(step: SessionStep, name: string): number {
  const items = step.report?.items ?? [];
  const n = norm(name);
  let i = items.findIndex((x) => norm(x.label) === n);
  if (i < 0 && n) i = items.findIndex((x) => norm(x.label).includes(n) || n.includes(norm(x.label)));
  if (i < 0 && items.length === 1) i = 0;
  return i;
}

const SYMBOL: Record<TryMark, string> = { own: "on their own", help: "with help", notyet: "not yet", none: "" };

/** "Ball: on their own, not yet (1 left) | Cup: nothing yet (3 left)" */
export function describeTally(step: SessionStep, tally: Tally) {
  return step
    .report!.items.map((item, row) => {
      const marks = tally.report.items[row].tries.filter((m) => m !== "none");
      const left = step.report!.triesPerItem - marks.length;
      return `${item.label}: ${marks.length ? marks.map((m) => SYMBOL[m]).join(", ") : "nothing yet"}${left ? ` (${left} left)` : ""}`;
    })
    .join(" | ");
}

/** What the model is told about a step after it moves on. */
export function stepForModel(res: Pick<SessionTurnResult, "step" | "summary">) {
  const s = res.step;
  if (s.phase === "done") return { sessionDone: true, summary: res.summary, closing: s.lines.join(" ") };
  if (s.phase === "explain") return { next: "explain", activity: s.activityLabel, title: s.activityTitle, feedbackOnLastActivity: s.feedback, guide: s.guide };
  if (s.phase === "report") return { next: "playing", activity: s.activityLabel, title: s.activityTitle, items: s.report?.items.map((i) => i.label), triesPerItem: s.report?.triesPerItem };
  return { next: s.phase };
}

export type ToolContext = {
  token: string;
  kidId: string;
  runId: string;
  step: SessionStep;
  tally: Tally | null;
};
export type ToolOutcome = {
  response: Record<string, unknown>;
  step?: SessionStep;
  tally?: Tally | null;
  summary?: string | null;
  /** The session is over (finished or ended): hang up after Pravnya's goodbye. */
  finished?: boolean;
};

const wrong = (what: string, step: SessionStep): ToolOutcome => ({ response: { error: `${what} Right now the session is at: ${step.phase}${step.activityTitle ? ` (${step.activityTitle})` : ""}.` } });

async function move(ctx: ToolContext, input: Parameters<typeof api.sessionTurn>[3]): Promise<ToolOutcome> {
  try {
    const res = await api.sessionTurn(ctx.token, ctx.kidId, ctx.runId, input);
    return { response: { ok: true, ...stepForModel(res) }, step: res.step, tally: emptyTally(res.step), summary: res.summary, finished: res.step.phase === "done" };
  } catch (err) {
    return { response: { error: err instanceof ApiError ? err.message : "That didn't go through; try again in a moment." } };
  }
}

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const { step } = ctx;
  switch (name) {
    case "ready_for_activity":
      if (step.phase !== "intro") return wrong("The introduction is already done.", step);
      return move(ctx, { choice: "ready" });
    case "start_playing":
      if (step.phase === "report") return { response: { ok: true, alreadyPlaying: true, items: step.report?.items.map((i) => i.label), triesPerItem: step.report?.triesPerItem } };
      if (step.phase !== "explain") return wrong("There's no activity to start.", step);
      return move(ctx, { choice: "start" });
    case "record_try": {
      if (step.phase !== "report" || !ctx.tally) return wrong("Tries can only be recorded after start_playing.", step);
      const row = findItem(step, String(args.item ?? ""));
      if (row < 0) return { response: { error: `"${String(args.item)}" isn't in this activity. The items are: ${step.report!.items.map((i) => i.label).join(", ")}.` } };
      const result = args.result;
      if (result !== "own" && result !== "help" && result !== "notyet") return { response: { error: "result must be own, help or notyet." } };
      const tries = ctx.tally.report.items[row].tries;
      const slot = tries.indexOf("none");
      const label = step.report!.items[row].label;
      if (slot < 0) return { response: { error: `All ${tries.length} tries for ${label} are already recorded. If one was wrong, use undo_last_try.` } };
      const helps = step.report!.helps.map((h) => h.id);
      const help = result === "help" && typeof args.help === "string" && helps.includes(args.help) ? args.help : ctx.tally.report.help;
      const tally: Tally = {
        report: { help, items: ctx.tally.report.items.map((it, r) => (r === row ? { ...it, tries: it.tries.map((m, n) => (n === slot ? result : m)) } : it)) },
        history: [...ctx.tally.history, { row, slot }]
      };
      return { response: { ok: true, recorded: `${label} try ${slot + 1}: ${SYMBOL[result]}`, tally: describeTally(step, tally) }, tally };
    }
    case "undo_last_try": {
      const last = ctx.tally?.history.at(-1);
      if (!ctx.tally || !last) return { response: { error: "There's nothing to undo." } };
      const tally: Tally = {
        report: { ...ctx.tally.report, items: ctx.tally.report.items.map((it, r) => (r === last.row ? { ...it, tries: it.tries.map((m, n) => (n === last.slot ? "none" : m)) } : it)) },
        history: ctx.tally.history.slice(0, -1)
      };
      return { response: { ok: true, tally: describeTally(step, tally) }, tally };
    }
    case "save_activity": {
      if (step.phase !== "report" || !ctx.tally) return wrong("There's no activity being played to save.", step);
      if (!ctx.tally.report.items.some((i) => i.tries.some((m) => m !== "none")))
        return { response: { error: "No tries are recorded yet. Ask the parent how it went, or use skip_activity if they didn't do it." } };
      return move(ctx, { report: ctx.tally.report });
    }
    case "skip_activity":
      if (step.phase !== "explain" && step.phase !== "report") return wrong("There's no activity to skip.", step);
      return move(ctx, { choice: "skip" });
    case "end_session":
      try {
        const res = await api.endSession(ctx.token, ctx.kidId, ctx.runId);
        return { response: { ok: true, sessionEnded: true, summary: res.summary }, summary: res.summary, finished: true };
      } catch (err) {
        return { response: { error: err instanceof ApiError ? err.message : "Couldn't end the session." } };
      }
    default:
      return { response: { error: `Unknown tool ${name}.` } };
  }
}
