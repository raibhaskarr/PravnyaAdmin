import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { AppError, badRequest, conflict, notFound } from "../../common/errors/AppError";
import { buildPeriodStats } from "../progress-updates/progressStats";
import { authorFor } from "../progress-updates/progressUpdates.service";
import { invitationEmailService } from "../therapist-invitations/invitationEmail.service";
import { draftPlanWithAi, interpretReport, interpretTurn, templatePlan, type GoalForDraft } from "./homeSessions.ai";
import { apply, applyReport, InvalidChoice, normalize, startState, summarize, view, type Language, type Report, type RunState, type TrialRecord } from "./homeSessions.engine";
import type { Plan, Schedule } from "./homeSessions.schemas";
import { loadCandidates, pickPractice, PRACTICE_PER_DAY } from "./homeSessions.practice";
import { callConfig, MAX_CALLS_PER_RUN, mintCallToken } from "./homeSessions.call";

const DAY = 86_400_000;
const RESUME_WITHIN_MS = 12 * 60 * 60_000;

// ---------- Helpers ----------

/** Today's weekday ("Mon") and date ("2026-11-17") in India, where the families are. */
function todayInIndia(now = new Date()) {
  const weekday = now.toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" });
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return { weekday, date };
}

export function isDueToday(schedule: Schedule, runs: { status: string; startedAt: Date }[], now = new Date()) {
  const completed = runs.filter((r) => r.status !== "IN_PROGRESS");
  if (schedule.kind === "once") return completed.length === 0;
  const { weekday, date } = todayInIndia(now);
  if (schedule.until && date > schedule.until) return false;
  if (!(schedule.days as string[]).includes(weekday)) return false;
  return !completed.some((r) => todayInIndia(r.startedAt).date === date);
}

function adminUrl() {
  return (env.APP_BASE_URL ?? env.CORS_ORIGIN.split(",")[0]?.trim() ?? "").replace(/\/$/, "");
}

async function findForStaff(user: AuthUser, id: string) {
  const session = await prisma.homeSession.findUnique({ where: { id } });
  if (!session) throw notFound("Session not found");
  await assertCanAccessKid(user, session.kidId);
  return session;
}

/** Every goal and item in the plan must belong to this child. */
async function assertPlanBelongsToKid(kidId: string, plan: Plan) {
  const goalIds = [...new Set(plan.activities.map((a) => a.goalId))];
  const goals = await prisma.goal.findMany({ where: { id: { in: goalIds }, kidId }, select: { id: true, items: { select: { id: true } } } });
  if (goals.length !== goalIds.length) throw badRequest("A goal in this session doesn't belong to this child");
  const itemsByGoal = new Map(goals.map((g) => [g.id, new Set(g.items.map((i) => i.id))]));
  for (const a of plan.activities) {
    if (a.items.some((i) => !itemsByGoal.get(a.goalId)!.has(i.goalItemId))) throw badRequest(`An item in "${a.goalTitle}" doesn't belong to that goal`);
  }
}

function independentRate(results: TrialRecord[]) {
  return results.length ? results.filter((r) => r.outcome === "CORRECT" && r.supportLevel === "INDEPENDENT").length / results.length : null;
}

/** Ends a run: status, summary, and an email to the therapist who set the session. */
async function finishRun(runId: string, status: "COMPLETED" | "ENDED_EARLY") {
  const run = await prisma.homeSessionRun.findUniqueOrThrow({
    where: { id: runId },
    include: { session: { select: { id: true, title: true, authorUserId: true, language: true } }, kid: { select: { firstName: true } } }
  });
  const state = run.state as unknown as RunState;
  const results = run.results as unknown as TrialRecord[];
  const summary = summarize(state.plan, results, state.language);
  await prisma.homeSessionRun.update({ where: { id: runId }, data: { status, endedAt: new Date(), summary } });
  if (!results.length || !run.session.authorUserId) return;

  const author = await prisma.user.findUnique({ where: { id: run.session.authorUserId }, select: { email: true } });
  if (!author) return;
  const previous = await prisma.homeSessionRun.findFirst({
    where: { sessionId: run.session.id, id: { not: runId }, status: { not: "IN_PROGRESS" }, startedAt: { lt: run.startedAt } },
    orderBy: { startedAt: "desc" },
    select: { results: true, startedAt: true }
  });
  const now = independentRate(results);
  const before = previous ? independentRate(previous.results as unknown as TrialRecord[]) : null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const comparison = now !== null ? `On their own: ${pct(now)} of tries${before !== null ? ` (last time ${pct(before)})` : ""}.` : "";
  const kid = run.kid.firstName;
  // The therapist gets English figures (the summary is in the session's language for the parent).
  const english = summarize(state.plan, results, "en");
  try {
    await invitationEmailService.sendHomeSessionSummary({
      to: author.email,
      subject: status === "COMPLETED" ? `${kid} did "${run.session.title}" at home` : `${kid} did part of "${run.session.title}" at home`,
      text: `${english}\n\n${comparison}${status === "ENDED_EARLY" ? "\nThe session was ended early." : ""}\n\nSee every try in the full report: ${adminUrl()}/tenant/kids/${run.kidId}`
    });
    await prisma.homeSessionRun.update({ where: { id: runId }, data: { summaryEmailedAt: new Date() } });
  } catch (e) {
    console.error(`[home session] summary email for run ${runId} failed:`, e instanceof Error ? e.message : e);
  }
}

async function logTry(runId: string, record: TrialRecord) {
  try {
    await prisma.goalItemEvidence.create({
      data: {
        goalItemId: record.goalItemId,
        logDate: new Date(record.at),
        outcome: record.outcome,
        supportLevel: record.supportLevel as Prisma.GoalItemEvidenceCreateInput["supportLevel"],
        modality: record.modality as Prisma.GoalItemEvidenceCreateInput["modality"],
        sessionRunId: runId
      }
    });
  } catch (e) {
    // The item was removed since the session was set: keep the result in the run, skip the log entry.
    console.error(`[home session] couldn't log a try for run ${runId}:`, e instanceof Error ? e.message : e);
  }
}

/** Today's practice sessions (Pravnya's) for a child: one with tries, or still going, counts. */
async function practiceToday(kidId: string, now = new Date()) {
  const sessions = await prisma.homeSession.findMany({
    where: { kidId, source: "PRAVNYA", createdAt: { gte: new Date(now.getTime() - 36 * 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { startedAt: "desc" }, select: { id: true, status: true, startedAt: true, results: true, summary: true } } }
  });
  const today = todayInIndia(now).date;
  const todays = sessions.filter((s) => todayInIndia(s.createdAt).date === today);
  const counted = todays.filter((s) => s.runs.some((r) => r.status === "IN_PROGRESS" || (r.results as unknown[]).length > 0));
  const open = sessions.flatMap((s) => s.runs).find((r) => r.status === "IN_PROGRESS" && now.getTime() - r.startedAt.getTime() < RESUME_WITHIN_MS) ?? null;
  return { used: counted.length, open, lastGoalIds: sessions[0] ? (sessions[0].plan as unknown as Plan).activities.map((a) => a.goalId) : [] };
}

const runSummaryFields = { id: true, status: true, startedAt: true, endedAt: true, summary: true } as const;

// ---------- Staff ----------

export const homeSessionsService = {
  async list(user: AuthUser, kidId: string) {
    await assertCanAccessKid(user, kidId);
    return prisma.homeSession.findMany({
      where: { kidId },
      orderBy: { createdAt: "desc" },
      include: { runs: { orderBy: { startedAt: "desc" }, select: { ...runSummaryFields, results: true } } }
    });
  },

  async draft(user: AuthUser, input: { kidId: string; goalIds: string[]; title?: string; language: Language; schedule: Schedule }) {
    const kid = await assertCanAccessKid(user, input.kidId);
    const kidRow = await prisma.kid.findUniqueOrThrow({ where: { id: kid.id }, select: { firstName: true } });
    const goals = await prisma.goal.findMany({
      where: { id: { in: input.goalIds }, kidId: kid.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        canonicalSkill: { select: { name: true, measurementType: true, domain: { select: { name: true } } } },
        items: { orderBy: { createdAt: "asc" }, select: { id: true, customText: true, canonicalSkillItem: { select: { displayName: true } } } }
      }
    });
    if (goals.length !== input.goalIds.length) throw badRequest("Pick active goals of this child");
    const to = new Date();
    const stats = await buildPeriodStats(kid.id, new Date(to.getTime() - 30 * DAY), to);
    const forDraft: GoalForDraft[] = goals.map((g) => {
      const s = stats.goals.find((x) => x.goalId === g.id);
      return {
        id: g.id,
        title: g.title,
        skill: g.canonicalSkill.name,
        area: g.canonicalSkill.domain.name,
        measurementType: g.canonicalSkill.measurementType,
        items: g.items.map((i) => ({ goalItemId: i.id, label: i.canonicalSkillItem?.displayName ?? i.customText ?? "" })).filter((i) => i.label),
        recent: s ? { entries: s.entries, correct: s.correct, independent: s.independent } : null
      };
    });
    const usable = forDraft.filter((g) => g.items.length);
    const skippedGoals = forDraft.filter((g) => !g.items.length).map((g) => g.title);
    if (!usable.length) throw badRequest("These goals have no items to practise yet. Add items (words, objects or steps) to a goal first.");

    const ai = await draftPlanWithAi(kidRow.firstName, usable, input.language, kid.tenantId);
    const plan = ai ?? templatePlan(kidRow.firstName, usable, input.language);
    const author = await authorFor(user);
    const session = await prisma.homeSession.create({
      data: {
        tenantId: kid.tenantId,
        kidId: kid.id,
        authorUserId: user.id,
        ...author,
        title: input.title ?? (input.language === "hi" ? `${kidRow.firstName} का घर का अभ्यास` : `${kidRow.firstName}'s home practice`),
        language: input.language,
        plan: plan as unknown as Prisma.InputJsonValue,
        schedule: input.schedule,
        aiDrafted: ai !== null
      }
    });
    return { ...session, skippedGoals };
  },

  async edit(user: AuthUser, id: string, input: { title?: string; language?: Language; schedule?: Schedule; plan?: Plan }) {
    const session = await findForStaff(user, id);
    if (session.status === "ARCHIVED") throw conflict("This session is archived", "ARCHIVED");
    if (session.source === "PRAVNYA") throw conflict("Practice sessions made by Pravnya can't be edited", "MADE_BY_PRAVNYA");
    if (input.plan) await assertPlanBelongsToKid(session.kidId, input.plan);
    return prisma.homeSession.update({
      where: { id },
      data: { title: input.title, language: input.language, schedule: input.schedule, plan: input.plan as unknown as Prisma.InputJsonValue | undefined }
    });
  },

  async publish(user: AuthUser, id: string) {
    const session = await findForStaff(user, id);
    if (session.status !== "DRAFT") throw conflict("Only a draft can be published", "NOT_DRAFT");
    await assertPlanBelongsToKid(session.kidId, session.plan as unknown as Plan);
    return prisma.homeSession.update({ where: { id }, data: { status: "ACTIVE", publishedAt: new Date() } });
  },

  async archive(user: AuthUser, id: string) {
    await findForStaff(user, id);
    return prisma.homeSession.update({ where: { id }, data: { status: "ARCHIVED" } });
  },

  async remove(user: AuthUser, id: string) {
    const session = await findForStaff(user, id);
    if (session.status !== "DRAFT") throw conflict("Only a draft can be deleted; archive a published session instead", "NOT_DRAFT");
    await prisma.homeSession.delete({ where: { id } });
  },

  // ---------- Parent ----------

  async listForParent(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    const sessions = await prisma.homeSession.findMany({
      where: { kidId, status: "ACTIVE", source: "THERAPIST" },
      orderBy: { publishedAt: "desc" },
      include: { runs: { orderBy: { startedAt: "desc" }, select: runSummaryFields } }
    });
    return sessions.map((s) => {
      const plan = s.plan as unknown as Plan;
      const resumable = s.runs.find((r) => r.status === "IN_PROGRESS" && Date.now() - r.startedAt.getTime() < RESUME_WITHIN_MS);
      return {
        id: s.id,
        title: s.title,
        authorName: s.authorName,
        centreName: s.centreName,
        schedule: s.schedule as unknown as Schedule,
        activities: plan.activities.map((a) => a.goalTitle),
        dueToday: isDueToday(s.schedule as unknown as Schedule, s.runs),
        inProgressRunId: resumable?.id ?? null,
        lastRun: s.runs.find((r) => r.status !== "IN_PROGRESS") ?? null
      };
    });
  },

  async start(parentId: string, kidId: string, sessionId: string) {
    await assertOwnsKid(parentId, kidId);
    const session = await prisma.homeSession.findFirst({ where: { id: sessionId, kidId, status: "ACTIVE" }, include: { kid: { select: { firstName: true } } } });
    if (!session) throw notFound("Session not found");
    const open = await prisma.homeSessionRun.findFirst({ where: { sessionId, status: "IN_PROGRESS", startedAt: { gt: new Date(Date.now() - RESUME_WITHIN_MS) } }, orderBy: { startedAt: "desc" } });
    if (!open && session.source === "PRAVNYA") throw conflict("This practice session is over. Start a new one from Activities.", "PRACTICE_OVER");
    const run =
      open ??
      (await prisma.homeSessionRun.create({
        data: {
          sessionId,
          tenantId: session.tenantId,
          kidId,
          // The plan is copied into the run, so editing the session later never breaks a run in progress.
          state: startState(session.plan as unknown as Plan, session.language as Language, session.kid.firstName) as unknown as Prisma.InputJsonValue
        }
      }));
    return { runId: run.id, title: session.title, step: view(run.state as unknown as RunState), resumed: !!open };
  },

  /** What the Activities tab shows for practice sessions: how many are left today, one to continue. */
  async practiceStatus(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    const [today, candidates] = await Promise.all([practiceToday(kidId), loadCandidates(kidId)]);
    const pick = pickPractice(candidates, today.lastGoalIds);
    return {
      perDay: PRACTICE_PER_DAY,
      usedToday: today.used,
      remainingToday: Math.max(0, PRACTICE_PER_DAY - today.used),
      inProgressRunId: today.open?.id ?? null,
      available: pick !== null,
      minutes: pick?.minutes ?? null
    };
  },

  /**
   * Pravnya puts a practice session together from the child's goals and recent progress, and starts
   * it. Continues the one in progress, if any; at most PRACTICE_PER_DAY a day.
   */
  async startPractice(parentId: string, kidId: string, input: { language: Language }) {
    const kid = await assertOwnsKid(parentId, kidId);
    const today = await practiceToday(kidId);
    if (today.open) {
      const run = await prisma.homeSessionRun.findUniqueOrThrow({ where: { id: today.open.id }, include: { session: { select: { title: true } } } });
      return { runId: run.id, title: run.session.title, step: view(run.state as unknown as RunState), resumed: true };
    }
    if (today.used >= PRACTICE_PER_DAY) {
      throw conflict(
        input.language === "hi"
          ? `आज के ${PRACTICE_PER_DAY} अभ्यास सत्र हो गए। कल फिर मिलते हैं!`
          : `That's today's ${PRACTICE_PER_DAY} practice sessions done. Short, regular practice works best, so come back tomorrow!`,
        "DAILY_LIMIT"
      );
    }
    const pick = pickPractice(await loadCandidates(kidId), today.lastGoalIds);
    if (!pick) throw badRequest("There's nothing to practise yet. Once your therapist adds goals with items, Pravnya can make a session.", "NO_GOALS");

    const kidRow = await prisma.kid.findUniqueOrThrow({ where: { id: kid.id }, select: { firstName: true, tenant: { select: { name: true } } } });
    const ai = await draftPlanWithAi(kidRow.firstName, pick.goals, input.language, kid.tenantId, "practice-session-draft");
    const base = ai ?? templatePlan(kidRow.firstName, pick.goals, input.language);
    // The picker decides the items, the order and the number of tries; the AI only writes the wording.
    const byGoal = new Map(base.activities.map((a) => [a.goalId, a]));
    const plan: Plan = {
      intro: base.intro,
      closing: base.closing,
      activities: pick.goals
        .map((g) => {
          const a = byGoal.get(g.id) ?? templatePlan(kidRow.firstName, [g], input.language).activities[0];
          return { ...a, goalTitle: g.title, items: g.items, trialsPerItem: g.trialsPerItem };
        })
    };
    const session = await prisma.homeSession.create({
      data: {
        tenantId: kid.tenantId,
        kidId: kid.id,
        authorUserId: null,
        authorName: "Pravnya",
        centreName: kidRow.tenant.name,
        title: input.language === "hi" ? `${kidRow.firstName} के साथ अभ्यास` : `Practice with ${kidRow.firstName}`,
        language: input.language,
        plan: plan as unknown as Prisma.InputJsonValue,
        schedule: { kind: "once" },
        aiDrafted: ai !== null,
        source: "PRAVNYA",
        status: "ACTIVE",
        publishedAt: new Date()
      }
    });
    const run = await prisma.homeSessionRun.create({
      data: { sessionId: session.id, tenantId: kid.tenantId, kidId, state: startState(plan, input.language, kidRow.firstName) as unknown as Prisma.InputJsonValue }
    });
    return { runId: run.id, title: session.title, step: view(run.state as unknown as RunState), resumed: false, minutes: pick.minutes };
  },

  async current(parentId: string, kidId: string, runId: string) {
    await assertOwnsKid(parentId, kidId);
    const run = await prisma.homeSessionRun.findFirst({ where: { id: runId, kidId } });
    if (!run) throw notFound("Session not found");
    return { runId, status: run.status, step: view(run.state as unknown as RunState), summary: run.summary };
  },

  async turn(parentId: string, kidId: string, runId: string, input: { choice?: string; text?: string; audio?: { mimeType: string; base64: string }; report?: Report }) {
    await assertOwnsKid(parentId, kidId);
    const run = await prisma.homeSessionRun.findFirst({ where: { id: runId, kidId } });
    if (!run) throw notFound("Session not found");
    if (run.status !== "IN_PROGRESS") throw conflict("This session has already ended", "ENDED");
    const state = normalize(run.state as unknown as RunState);
    const step = view(state);

    let choice = input.choice ?? null;
    let reply: string | null = null;
    if (!choice && !input.report) {
      const activity = state.plan.activities[state.a] ?? null;
      const understood = await interpretTurn(step, { kidName: state.kidName, language: state.language, activity }, { text: input.text, audio: input.audio }, run.tenantId);
      if (!understood) {
        reply = state.language === "hi" ? "माफ़ कीजिए, मैं समझ नहीं पाई। कृपया नीचे का कोई बटन दबाइए।" : "Sorry, I couldn't follow that. Please tap one of the buttons below.";
        return { status: run.status, step, reply, logged: [], summary: null };
      }
      reply = understood.reply;
      if (understood.intent === "answer") return { status: run.status, step, reply, logged: [], summary: null };
      choice = understood.choice;
    }

    let nextState: RunState;
    let records: TrialRecord[] = [];
    try {
      if (input.report) ({ state: nextState, records } = applyReport(state, input.report));
      else nextState = apply(state, choice!).state;
    } catch (e) {
      if (e instanceof InvalidChoice) throw badRequest(e.message);
      throw e;
    }
    const results = [...(run.results as unknown as TrialRecord[]), ...records];
    await prisma.homeSessionRun.update({ where: { id: runId }, data: { state: nextState as unknown as Prisma.InputJsonValue, results: results as unknown as Prisma.InputJsonValue } });
    for (const record of records) await logTry(runId, record);
    let status: string = run.status;
    let summary: string | null = null;
    if (nextState.phase === "done") {
      await finishRun(runId, "COMPLETED");
      status = "COMPLETED";
      summary = summarize(nextState.plan, results, nextState.language);
    }
    return { status, step: view(nextState), reply, logged: records, summary };
  },

  /** Fills in the report from what the parent typed or said. Nothing is saved: the parent checks it and sends it as a turn. */
  async reportDraft(parentId: string, kidId: string, runId: string, input: { text?: string; audio?: { mimeType: string; base64: string } }) {
    await assertOwnsKid(parentId, kidId);
    const run = await prisma.homeSessionRun.findFirst({ where: { id: runId, kidId } });
    if (!run) throw notFound("Session not found");
    if (run.status !== "IN_PROGRESS") throw conflict("This session has already ended", "ENDED");
    const state = normalize(run.state as unknown as RunState);
    const step = view(state);
    if (step.phase !== "report" || !step.report) throw badRequest("There's nothing to report right now");
    const draft = await interpretReport(step.report, { kidName: state.kidName, language: state.language, activityTitle: step.activityTitle ?? "" }, input, run.tenantId);
    if (!draft) {
      return {
        report: null,
        reply: state.language === "hi" ? "माफ़ कीजिए, मैं समझ नहीं पाई। कृपया हर कोशिश पर निशान लगाइए।" : "Sorry, I couldn't follow that. Please mark the tries instead."
      };
    }
    return draft;
  },

  /** Starts (or reconnects) a hands-free call for a run: a short-lived token locked to Pravnya's instructions for where the session is now. */
  async startCall(parentId: string, kidId: string, runId: string) {
    await assertOwnsKid(parentId, kidId);
    const run = await prisma.homeSessionRun.findFirst({ where: { id: runId, kidId } });
    if (!run) throw notFound("Session not found");
    if (run.status !== "IN_PROGRESS") throw conflict("This session has already ended", "ENDED");
    const state = run.state as unknown as RunState & { calls?: number };
    const calls = state.calls ?? 0;
    if (calls >= MAX_CALLS_PER_RUN) throw conflict("That's the most calls for one session. Carry on with the step-by-step screens.", "CALL_LIMIT");
    const token = await mintCallToken(callConfig(state));
    if (!token) throw new AppError(503, "CALL_UNAVAILABLE", "Calls aren't available right now. Carry on with the step-by-step screens.");
    await prisma.homeSessionRun.update({ where: { id: runId }, data: { state: { ...state, calls: calls + 1 } as unknown as Prisma.InputJsonValue } });
    return { ...token, step: view(state) };
  },

  async end(parentId: string, kidId: string, runId: string) {
    await assertOwnsKid(parentId, kidId);
    const run = await prisma.homeSessionRun.findFirst({ where: { id: runId, kidId } });
    if (!run) throw notFound("Session not found");
    if (run.status === "IN_PROGRESS") await finishRun(runId, "ENDED_EARLY");
    const ended = await prisma.homeSessionRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true, summary: true } });
    return ended;
  }
};
