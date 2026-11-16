import { z } from "zod";
import { createExecutionContext } from "@pravnix/ai-core";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid, kidVisibilityFilter } from "../../common/access/kidAccess";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { conflict, notFound } from "../../common/errors/AppError";
import { orchestrator } from "../ai/ai.platform";
import { invitationEmailService } from "../therapist-invitations/invitationEmail.service";
import { buildPeriodStats, type PeriodStats } from "./progressStats";

type Language = "en" | "hi";
const DAY = 86_400_000;

// ---------- Wording ----------

const HEADINGS: Record<Language, { highlights: string; workingOn: string; tryAtHome: string }> = {
  en: { highlights: "Highlights", workingOn: "What we're working on", tryAtHome: "Try at home" },
  hi: { highlights: "खास बातें", workingOn: "हम किस पर काम कर रहे हैं", tryAtHome: "घर पर आज़माइए" }
};

const draftSchema = z.object({
  opening: z.string().min(1).max(400),
  highlights: z.array(z.string().min(1).max(300)).max(4),
  workingOn: z.array(z.string().min(1).max(300)).max(4),
  tryAtHome: z.array(z.string().min(1).max(300)).min(1).max(3),
  closing: z.string().max(300)
});
type Draft = z.infer<typeof draftSchema>;

// The model only words figures computed from real evidence; it must not add facts, numbers,
// predictions or clinical judgements. A staff member edits and sends every update.
const SYSTEM_PROMPT =
  "You help a therapist at a child-therapy centre write a short, warm progress update to a child's parent. " +
  "You are given the child's name and figures computed from the therapy and home logs for a period. " +
  "Write as the therapist (\"we\", \"this week\"), to the parent (\"you\"). Plain everyday words, no jargon, " +
  "no acronyms, short sentences; it is read on a phone.\n\n" +
  "Rules, always:\n" +
  "- Use ONLY what the figures say. Never invent events, numbers, skills or quotes. You may say \"most times\", " +
  "\"several times\" or quote the given counts; do not compute percentages.\n" +
  "- Never diagnose, never predict outcomes or timelines, never mention medication, never compare with other children.\n" +
  "- Celebrate real gains (firstTimeIndependent, trend up, practice at home) without exaggerating. " +
  "If something is harder right now (trend down), say so gently and constructively.\n" +
  "- tryAtHome: 1-3 small, concrete things a parent can do in daily routines, tied to the goals listed.\n" +
  "- If there were no entries, say warmly that there's not much to report this time and suggest one thing to try.\n\n" +
  "Respond with ONLY a JSON object, no markdown fences: " +
  '{"opening": string (1-2 sentences), "highlights": string[] (0-4), "workingOn": string[] (1-4), ' +
  '"tryAtHome": string[] (1-3), "closing": string (1 sentence)}.';

function languageInstruction(language: Language) {
  return language === "hi"
    ? "Write every string in natural, everyday Hindi (Devanagari), the way a parent in India would speak -- not a word-for-word translation. Keep the child's name and goal names readable; English words parents commonly use (therapy, session) are fine."
    : "Write in simple Indian English.";
}

function compose(d: Draft, language: Language, authorName: string) {
  const h = HEADINGS[language];
  const section = (title: string, lines: string[]) => (lines.length ? `${title}\n${lines.map((l) => `• ${l}`).join("\n")}` : "");
  return [d.opening, section(h.highlights, d.highlights), section(h.workingOn, d.workingOn), section(h.tryAtHome, d.tryAtHome), d.closing, `— ${authorName}`]
    .filter((p) => p.trim())
    .join("\n\n");
}

/** Used when the AI is unavailable: the same figures, in plain sentences. */
function templateDraft(stats: PeriodStats, language: Language): Draft {
  const name = stats.kidName;
  const top = stats.goals.slice(0, 4);
  if (language === "hi") {
    return {
      opening: stats.totalEntries ? `${name} के साथ इस बार ${stats.totalEntries} बार अभ्यास दर्ज हुआ।` : `इस बार ${name} के बारे में दर्ज करने के लिए ज़्यादा कुछ नहीं था।`,
      highlights: top.filter((g) => g.firstTimeIndependent.length).map((g) => `${g.goalTitle}: पहली बार खुद से — ${g.firstTimeIndependent.join(", ")}`),
      workingOn: top.map((g) => `${g.goalTitle} (${g.entries} बार${g.atHome ? `, ${g.atHome} बार घर पर` : ""})`),
      tryAtHome: [top[0] ? `रोज़मर्रा के कामों में "${top[0].goalTitle}" का अभ्यास कराइए और Pravnya में लिख लीजिए।` : "रोज़ के किसी एक काम में अभ्यास कराइए और Pravnya में लिख लीजिए।"],
      closing: "कोई सवाल हो तो अगले सेशन में ज़रूर पूछिए।"
    };
  }
  return {
    opening: stats.totalEntries ? `Here's a quick update on ${name}: ${stats.totalEntries} practice entries were logged this time.` : `There isn't much logged for ${name} this time.`,
    highlights: top.filter((g) => g.firstTimeIndependent.length).map((g) => `${g.goalTitle}: did ${g.firstTimeIndependent.join(", ")} independently for the first time`),
    workingOn: top.map((g) => `${g.goalTitle} (${g.entries} time${g.entries === 1 ? "" : "s"}${g.atHome ? `, ${g.atHome} at home` : ""})`),
    tryAtHome: [top[0] ? `Practise "${top[0].goalTitle}" during everyday routines and log it in Pravnya.` : "Pick one everyday routine to practise in, and log it in Pravnya."],
    closing: "If you have any questions, bring them to the next session."
  };
}

async function draftWithAi(stats: PeriodStats, language: Language, tenantId: string): Promise<Draft | null> {
  const result = await orchestrator.executeStructured({
    name: "pravnyaadmin.progress-update-draft",
    request: {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: `${languageInstruction(language)}\n\nFigures:\n${JSON.stringify(stats, null, 1)}` }] }],
      executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId, featureId: "progress-update-draft" })
    },
    schema: draftSchema,
    maxRepairAttempts: 1
  });
  return result.success ? result.value : null;
}

// ---------- Helpers ----------

async function authorFor(user: AuthUser) {
  const [dbUser, therapist, tenant] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } }),
    prisma.therapist.findUnique({ where: { userId: user.id }, select: { name: true } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId! }, select: { id: true, name: true } })
  ]);
  // The retail tenant is the company behind self-registered families, not a centre a parent knows.
  const centreName = tenant.id === env.RETAIL_TENANT_ID ? "" : tenant.name;
  return { authorName: therapist?.name ?? dbUser.name, centreName };
}

function periodFor(input: { period: "week" | "month" | "custom"; from?: Date; to?: Date }) {
  if (input.period === "custom") {
    const to = new Date(input.to!.getTime());
    to.setUTCHours(23, 59, 59, 999);
    return { from: input.from!, to };
  }
  const to = new Date();
  const from = new Date(to.getTime() - (input.period === "month" ? 30 : 7) * DAY);
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

async function findForStaff(user: AuthUser, id: string) {
  const update = await prisma.progressUpdate.findUnique({ where: { id } });
  if (!update) throw notFound("Update not found");
  await assertCanAccessKid(user, update.kidId);
  return update;
}

const parentFields = { id: true, authorName: true, centreName: true, language: true, periodStart: true, periodEnd: true, body: true, sentAt: true, readAt: true } as const;

// ---------- Service ----------

export const progressUpdatesService = {
  async listForStaff(user: AuthUser, kidId: string) {
    await assertCanAccessKid(user, kidId);
    return prisma.progressUpdate.findMany({ where: { kidId }, orderBy: { createdAt: "desc" } });
  },

  /** Kids this user can see who have a parent account, with when they last got an update and what's been logged since. */
  async due(user: AuthUser) {
    const filter = await kidVisibilityFilter(user);
    const kids = await prisma.kid.findMany({
      where: { ...filter, status: "ACTIVE", parentId: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        progressUpdates: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, sentAt: true } }
      }
    });
    const rows = await Promise.all(
      kids.map(async (k) => {
        const lastSentAt = k.progressUpdates.find((u) => u.status === "SENT")?.sentAt ?? null;
        const since = lastSentAt ?? new Date(Date.now() - 7 * DAY);
        const newEntries = await prisma.goalItemEvidence.count({ where: { goalItem: { goal: { kidId: k.id } }, createdAt: { gt: since } } });
        const draftId = k.progressUpdates.find((u) => u.status === "DRAFT")?.id ?? null;
        const isDue = newEntries > 0 && (!lastSentAt || Date.now() - lastSentAt.getTime() >= 7 * DAY);
        return { kidId: k.id, kidName: `${k.firstName} ${k.lastName}`.trim(), lastSentAt, newEntries, draftId, isDue };
      })
    );
    return rows.sort((a, b) => Number(b.isDue) - Number(a.isDue) || b.newEntries - a.newEntries);
  },

  async createDraft(user: AuthUser, input: { kidId: string; period: "week" | "month" | "custom"; from?: Date; to?: Date; language: Language }) {
    const kid = await assertCanAccessKid(user, input.kidId);
    const { from, to } = periodFor(input);
    const stats = await buildPeriodStats(kid.id, from, to);
    const author = await authorFor(user);
    const ai = await draftWithAi(stats, input.language, kid.tenantId);
    const body = compose(ai ?? templateDraft(stats, input.language), input.language, author.authorName);
    return prisma.progressUpdate.create({
      data: {
        tenantId: kid.tenantId,
        kidId: kid.id,
        authorUserId: user.id,
        ...author,
        language: input.language,
        periodStart: from,
        periodEnd: to,
        body,
        stats,
        aiDrafted: ai !== null
      }
    });
  },

  async editDraft(user: AuthUser, id: string, body: string) {
    const update = await findForStaff(user, id);
    if (update.status !== "DRAFT") throw conflict("This update has already been sent and can't be changed", "ALREADY_SENT");
    return prisma.progressUpdate.update({ where: { id }, data: { body } });
  },

  async removeDraft(user: AuthUser, id: string) {
    const update = await findForStaff(user, id);
    if (update.status !== "DRAFT") throw conflict("A sent update can't be deleted", "ALREADY_SENT");
    await prisma.progressUpdate.delete({ where: { id } });
  },

  /** Publishes the update in the parent app and emails the parent. An email failure doesn't undo the send. */
  async send(user: AuthUser, id: string) {
    const update = await findForStaff(user, id);
    if (update.status !== "DRAFT") throw conflict("This update has already been sent", "ALREADY_SENT");
    const kid = await prisma.kid.findUniqueOrThrow({ where: { id: update.kidId }, select: { firstName: true, parent: { select: { email: true } } } });
    if (!kid.parent) throw conflict("This child has no parent account to send the update to", "NO_PARENT");

    const sent = await prisma.progressUpdate.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });

    const from = update.centreName ? `${update.authorName}, ${update.centreName}` : update.authorName;
    const subject = update.language === "hi" ? `${kid.firstName} के बारे में ${from} का अपडेट` : `An update on ${kid.firstName} from ${from}`;
    const footer =
      update.language === "hi"
        ? `\n\n${kid.firstName} की पूरी प्रगति Pravnya में देखिए: ${env.PARENT_APP_URL}`
        : `\n\nSee ${kid.firstName}'s progress in Pravnya: ${env.PARENT_APP_URL}`;
    try {
      await invitationEmailService.sendProgressUpdate({ to: kid.parent.email, subject, text: update.body + footer });
      return prisma.progressUpdate.update({ where: { id }, data: { emailedAt: new Date() } });
    } catch (e) {
      console.error(`[progress update] email for update ${id} failed:`, e instanceof Error ? e.message : e);
      return sent;
    }
  },

  async listForParent(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    return prisma.progressUpdate.findMany({ where: { kidId, status: "SENT" }, orderBy: { sentAt: "desc" }, select: parentFields });
  },

  async markRead(parentId: string, kidId: string, updateId: string) {
    await assertOwnsKid(parentId, kidId);
    const update = await prisma.progressUpdate.findFirst({ where: { id: updateId, kidId, status: "SENT" } });
    if (!update) throw notFound("Update not found");
    if (update.readAt) return prisma.progressUpdate.findUniqueOrThrow({ where: { id: updateId }, select: parentFields });
    return prisma.progressUpdate.update({ where: { id: updateId }, data: { readAt: new Date() }, select: parentFields });
  }
};
