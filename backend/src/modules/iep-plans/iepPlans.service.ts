import { z } from "zod";
import { createExecutionContext } from "@pravnix/ai-core";
import { prisma } from "../../config/prisma";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { env } from "../../config/env";
import { invitationEmailService } from "../therapist-invitations/invitationEmail.service";
import { badRequest, conflict, notFound } from "../../common/errors/AppError";
import { orchestrator } from "../ai/ai.platform";
import { buildPeriodStats, type GoalPeriodStats, type PeriodStats } from "../progress-updates/progressStats";
import { authorFor } from "../progress-updates/progressUpdates.service";
import type { PlanContent, PlanGoal } from "./iepPlans.schemas";

const DAY = 86_400_000;
const DEFAULT_TITLE = "Individualised Education Plan";

// ---------- Drafting ----------

// The model words baselines from computed figures and proposes measurable targets. Staff check
// and edit every line before finalising; nothing here is shown to a parent until they do.
const SYSTEM_PROMPT =
  "You help a therapist at a child-therapy centre draft an Individualised Education Plan (IEP). " +
  "You are given the child's first name, their active goals and figures computed from the therapy and home logs " +
  "over a baseline period: per goal, how many attempts were logged, how many were correct, how many correct with no " +
  "help (independent), partly correct, at the centre or at home, example items done correctly, items done " +
  "independently for the first time, and a trend against the period before (null when there's too little data).\n\n" +
  "For each goal write:\n" +
  "- baseline: where the child is now, in 1-2 sentences, using ONLY the given figures (you may quote counts, e.g. " +
  "\"correct in 6 of 9 attempts, 2 without help\"; do not compute percentages). If a goal has no entries, say it was " +
  "not logged in this period and the baseline needs to be assessed.\n" +
  "- target: ONE measurable target for the review date: the condition (with what help or in what setting), the " +
  "observable behaviour, and the criterion (e.g. \"in 4 of 5 opportunities across 3 sessions\"). Make it a realistic " +
  "next step from the baseline -- usually less help or more consistency, not a leap.\n" +
  "- strategies: 1-3 short teaching strategies the team will use.\n" +
  "- homePractice: 1-2 small things the family can do in daily routines.\n" +
  "Also write presentLevels (3-5 plain sentences summarising the child's current performance across the goals, from " +
  "the figures only) and strengths (1-4 short points from real gains: firstTimeIndependent, trend up, consistent home practice).\n\n" +
  "Rules, always: never invent events, numbers, skills or quotes; never diagnose; never predict outcomes; never mention " +
  "medication; never compare with other children. Plain professional English a parent can read; no jargon or acronyms " +
  "beyond IEP.\n\n" +
  "Respond with ONLY a JSON object, no markdown fences: " +
  '{"presentLevels": string, "strengths": string[], "goals": [{"goalId": string (from the input), "baseline": string, ' +
  '"target": string, "strategies": string[], "homePractice": string[]}]}. Include every goal from the input once.';

function aiSchema(goalIds: Set<string>) {
  const s = z.string().trim().min(1);
  return z.object({
    presentLevels: s.max(3000),
    strengths: z.array(s.max(300)).max(5),
    goals: z
      .array(
        z.object({
          goalId: z.string().refine((id) => goalIds.has(id), "Unknown goalId"),
          baseline: s.max(600),
          target: s.max(600),
          strategies: z.array(s.max(300)).max(4),
          homePractice: z.array(s.max(300)).max(3)
        })
      )
      .max(40)
  });
}
type AiDraft = z.infer<ReturnType<typeof aiSchema>>;

type ActiveGoal = { id: string; title: string; area: string };

function templateBaseline(g: GoalPeriodStats | undefined, days: number) {
  if (!g || g.entries === 0) return "Not logged in this period; baseline to be assessed.";
  const parts = [`Over the last ${days} days, ${g.entries} attempt${g.entries === 1 ? "" : "s"} logged: ${g.correct} correct (${g.independent} without help${g.partial ? `, ${g.partial} partly correct` : ""})`];
  parts.push(`${g.atCentre} at the centre, ${g.atHome} at home`);
  let text = parts.join("; ") + ".";
  if (g.examples.length) text += ` Correct with: ${g.examples.join(", ")}.`;
  return text;
}

/** Used when the AI is unavailable: baselines straight from the figures, targets left for the therapist. */
function templateContent(stats: PeriodStats, goals: ActiveGoal[], days: number): PlanContent {
  const byId = new Map(stats.goals.map((g) => [g.goalId, g]));
  const strengths = stats.goals
    .flatMap((g) => [
      g.firstTimeIndependent.length ? `${g.goalTitle}: did ${g.firstTimeIndependent.join(", ")} without help for the first time` : null,
      g.trend === "up" ? `${g.goalTitle}: more often correct than in the period before` : null
    ])
    .filter((x): x is string => !!x)
    .slice(0, 4);
  return {
    presentLevels: `${stats.kidName} has ${goals.length} active goal${goals.length === 1 ? "" : "s"}. ${stats.totalEntries} attempt${stats.totalEntries === 1 ? " was" : "s were"} logged in the last ${days} days.`,
    strengths,
    goals: goals.map((g) => ({ goalId: g.id, title: g.title, area: g.area, baseline: templateBaseline(byId.get(g.id), days), target: "", strategies: [], homePractice: [] })),
    notes: ""
  };
}

function mergeAi(ai: AiDraft, fallback: PlanContent): PlanContent {
  const byId = new Map(ai.goals.map((g) => [g.goalId, g]));
  return {
    presentLevels: ai.presentLevels,
    strengths: ai.strengths,
    goals: fallback.goals.map((g): PlanGoal => {
      const a = byId.get(g.goalId);
      return a ? { ...g, baseline: a.baseline, target: a.target, strategies: a.strategies, homePractice: a.homePractice } : g;
    }),
    notes: ""
  };
}

async function draftWithAi(stats: PeriodStats, goals: ActiveGoal[], reviewDate: Date, tenantId: string): Promise<AiDraft | null> {
  if (goals.length === 0) return null;
  const input = {
    childFirstName: stats.kidName,
    baselinePeriod: { from: stats.from, to: stats.to },
    reviewDate: reviewDate.toISOString().slice(0, 10),
    goals: goals.map((g) => {
      const s = stats.goals.find((x) => x.goalId === g.id);
      const { goalId: _id, goalTitle: _t, domain: _d, ...figures } = s ?? ({} as GoalPeriodStats);
      return { goalId: g.id, title: g.title, area: g.area, figures: s ? figures : { entries: 0 } };
    })
  };
  const result = await orchestrator.executeStructured({
    name: "pravnyaadmin.iep-plan-draft",
    request: {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: JSON.stringify(input, null, 1) }] }],
      executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId, featureId: "iep-plan-draft" })
    },
    schema: aiSchema(new Set(goals.map((g) => g.id))),
    maxRepairAttempts: 1
  });
  return result.success ? result.value : null;
}

// ---------- Helpers ----------

async function findForStaff(user: AuthUser, id: string) {
  const plan = await prisma.iepPlan.findUnique({ where: { id } });
  if (!plan) throw notFound("Plan not found");
  await assertCanAccessKid(user, plan.kidId);
  return plan;
}

function missingForFinal(content: PlanContent) {
  const missing: string[] = [];
  if (!content.presentLevels.trim()) missing.push("present levels");
  if (content.goals.length === 0) missing.push("at least one goal");
  for (const g of content.goals) {
    if (!g.baseline.trim()) missing.push(`a baseline for "${g.title}"`);
    if (!g.target.trim()) missing.push(`a target for "${g.title}"`);
  }
  return missing;
}

const parentFields = {
  id: true,
  title: true,
  authorName: true,
  centreName: true,
  planStart: true,
  reviewDate: true,
  content: true,
  sharedAt: true,
  readAt: true
} as const;

function day(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** The email carries the goals and targets in plain text; the full plan is in the app. */
function emailText(plan: { title: string; reviewDate: Date; content: unknown }, kidName: string) {
  const c = plan.content as PlanContent;
  const goals = c.goals.map((g, i) => `${i + 1}. ${g.title}\n   Target: ${g.target}`).join("\n\n");
  return (
    `${kidName}'s ${plan.title} is ready. Here are the goals and what we're aiming for by ${day(plan.reviewDate)}:\n\n${goals}\n\n` +
    `See the full plan, including how to practise at home, in Pravnya: ${env.PARENT_APP_URL}`
  );
}

// ---------- Service ----------

export const iepPlansService = {
  async list(user: AuthUser, kidId: string) {
    await assertCanAccessKid(user, kidId);
    return prisma.iepPlan.findMany({ where: { kidId }, orderBy: { createdAt: "desc" } });
  },

  async createDraft(user: AuthUser, input: { kidId: string; baselineDays: 30 | 90; reviewDate?: Date; title?: string }) {
    const kid = await assertCanAccessKid(user, input.kidId);
    const to = new Date();
    const from = new Date(to.getTime() - input.baselineDays * DAY);
    from.setUTCHours(0, 0, 0, 0);
    const reviewDate = input.reviewDate ?? new Date(to.getTime() + 91 * DAY);
    if (reviewDate <= to) throw badRequest("The review date must be in the future");

    const goals = (
      await prisma.goal.findMany({
        where: { kidId: kid.id, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, canonicalSkill: { select: { domain: { select: { name: true } } } } }
      })
    ).map((g) => ({ id: g.id, title: g.title, area: g.canonicalSkill.domain.name }));
    const stats = await buildPeriodStats(kid.id, from, to);
    const fallback = templateContent(stats, goals, input.baselineDays);
    const ai = await draftWithAi(stats, goals, reviewDate, kid.tenantId);
    const author = await authorFor(user);

    return prisma.iepPlan.create({
      data: {
        tenantId: kid.tenantId,
        kidId: kid.id,
        authorUserId: user.id,
        ...author,
        title: input.title ?? DEFAULT_TITLE,
        baselineFrom: from,
        baselineTo: to,
        planStart: to,
        reviewDate,
        content: ai ? mergeAi(ai, fallback) : fallback,
        stats,
        aiDrafted: ai !== null
      }
    });
  },

  async edit(user: AuthUser, id: string, input: { title?: string; reviewDate?: Date; content?: PlanContent }) {
    const plan = await findForStaff(user, id);
    if (plan.status !== "DRAFT") throw conflict("This plan is final and can't be changed. Draft a new one for the next review.", "ALREADY_FINAL");
    if (input.content) {
      const ids = [...new Set(input.content.goals.map((g) => g.goalId))];
      const owned = await prisma.goal.count({ where: { id: { in: ids }, kidId: plan.kidId } });
      if (owned !== ids.length) throw badRequest("A goal in this plan doesn't belong to this child");
    }
    if (input.reviewDate && input.reviewDate <= plan.planStart) throw badRequest("The review date must be after the plan start");
    return prisma.iepPlan.update({ where: { id }, data: { title: input.title, reviewDate: input.reviewDate, content: input.content } });
  },

  async finalise(user: AuthUser, id: string) {
    const plan = await findForStaff(user, id);
    if (plan.status !== "DRAFT") throw conflict("This plan is already final", "ALREADY_FINAL");
    const missing = missingForFinal(plan.content as PlanContent);
    if (missing.length) throw conflict(`Before finalising, add ${missing.join(", ")}.`, "INCOMPLETE");
    return prisma.iepPlan.update({ where: { id }, data: { status: "FINAL", finalisedAt: new Date() } });
  },

  /** Publishes a final plan in the parent app and emails the parent. An email failure doesn't undo the share. */
  async share(user: AuthUser, id: string) {
    const plan = await findForStaff(user, id);
    if (plan.status !== "FINAL") throw conflict("Finalise the plan before sharing it", "NOT_FINAL");
    if (plan.sharedAt) throw conflict("This plan has already been shared", "ALREADY_SHARED");
    const kid = await prisma.kid.findUniqueOrThrow({ where: { id: plan.kidId }, select: { firstName: true, parent: { select: { email: true } } } });
    if (!kid.parent) throw conflict("This child has no parent account to share the plan with", "NO_PARENT");

    const shared = await prisma.iepPlan.update({ where: { id }, data: { sharedAt: new Date() } });
    const from = plan.centreName ? `${plan.authorName}, ${plan.centreName}` : plan.authorName;
    try {
      await invitationEmailService.sendIepPlan({ to: kid.parent.email, subject: `${kid.firstName}'s ${plan.title} from ${from}`, text: emailText(plan, kid.firstName) });
      return prisma.iepPlan.update({ where: { id }, data: { emailedAt: new Date() } });
    } catch (e) {
      console.error(`[iep plan] email for plan ${id} failed:`, e instanceof Error ? e.message : e);
      return shared;
    }
  },

  async listForParent(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    return prisma.iepPlan.findMany({ where: { kidId, status: "FINAL", sharedAt: { not: null } }, orderBy: { sharedAt: "desc" }, select: parentFields });
  },

  async markRead(parentId: string, kidId: string, planId: string) {
    await assertOwnsKid(parentId, kidId);
    const plan = await prisma.iepPlan.findFirst({ where: { id: planId, kidId, status: "FINAL", sharedAt: { not: null } } });
    if (!plan) throw notFound("Plan not found");
    if (plan.readAt) return prisma.iepPlan.findUniqueOrThrow({ where: { id: planId }, select: parentFields });
    return prisma.iepPlan.update({ where: { id: planId }, data: { readAt: new Date() }, select: parentFields });
  },

  async removeDraft(user: AuthUser, id: string) {
    const plan = await findForStaff(user, id);
    if (plan.status !== "DRAFT") throw conflict("A final plan can't be deleted", "ALREADY_FINAL");
    await prisma.iepPlan.delete({ where: { id } });
  }
};
