import { Prisma, type PocSupportLevel } from "@prisma/client";
import { createExecutionContext } from "@pravnix/ai-core";
import { prisma } from "../../config/prisma";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { notFound } from "../../common/errors/AppError";
import { orchestrator } from "../ai/ai.platform";
import { guideContentSchema, type GuideContent } from "./homeGuides.schemas";

// ---------- Drafting a skill's guide ----------

// One guide per skill, written for any parent, then reviewed by the team. The child's own item,
// level of help and therapist's notes are added around it by the app, never by the model.
const SYSTEM_PROMPT =
  "You write short, practical guides that walk a parent through practising one therapy skill with their child at home, " +
  "in a normal day (play, meals, bath, getting dressed, going out). Families are in India; ordinary household things only.\n\n" +
  "Write for any child working on this skill: say \"your child\", never a name. The app tells the parent which item to " +
  "practise with today (for example a word, an object or a step), so refer to it as \"the item you're practising\" or in " +
  "general terms; don't pick one.\n\n" +
  "Content:\n" +
  "- summary: 1-2 sentences on what you're practising and why it helps, in everyday words.\n" +
  "- minutes: how long one go takes (usually 3-10).\n" +
  "- materials: what to have ready (0-5 short items; household things).\n" +
  "- steps: 3-6 steps in order. Each has a short title and a detail that says exactly what the parent does and says " +
  "(give example words in quotes), and what to wait for. Include creating the moment, showing or saying it once, then " +
  "WAITING quietly for the child to try.\n" +
  "- ifItsHard: 2-4 ways to help, least help first (wait longer -> point or gesture -> say it or show it for them to copy " +
  "-> gently help with your hands), then fade the help next time.\n" +
  "- success: what doing it looks like, so the parent can tell; any try counts, and note how much help was needed.\n" +
  "- keepItFun: 1-3 short tips (praise the effort, follow their interest, stop while it's going well).\n" +
  "- stopIf: when to stop (upset, tired, hungry, refusing) and to end on something easy.\n\n" +
  "Rules, always: plain, warm English, short sentences, no jargon or acronyms. No diagnosis, no promises about results or " +
  "timelines, nothing about medication. Never force, hold down or punish; never withhold food, water, comfort or the toilet " +
  "as a consequence (a short pause before handing something over, to give the child a chance to ask, is fine). For eating, " +
  "drinking or swallowing, toileting, or anything with a choking or injury risk, keep to setting up the moment and say to " +
  "follow the therapist's own instructions for the rest.\n\n" +
  'Respond with ONLY a JSON object, no markdown fences: {"summary": string, "minutes": number, "materials": string[], ' +
  '"steps": [{"title": string, "detail": string}], "ifItsHard": string[], "success": string, "keepItFun": string[], "stopIf": string}.';

type SkillForGuide = { id: string; name: string; description: string | null; domain: { name: string }; defaultDiscipline: { name: string } | null; items: { displayName: string }[] };

async function draftWithAi(skill: SkillForGuide, tenantId: string): Promise<GuideContent | null> {
  const input = {
    skill: skill.name,
    description: skill.description,
    area: skill.domain.name,
    discipline: skill.defaultDiscipline?.name ?? null,
    exampleItems: skill.items.slice(0, 8).map((i) => i.displayName)
  };
  const result = await orchestrator.executeStructured({
    name: "pravnyaadmin.skill-home-guide",
    request: {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: JSON.stringify(input, null, 1) }] }],
      executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId, featureId: "skill-home-guide" })
    },
    schema: guideContentSchema,
    maxRepairAttempts: 1
  });
  return result.success ? result.value : null;
}

/** Shown when a skill has no guide yet and the AI can't write one: the same shape, in general terms. */
export function generalGuide(what: string): GuideContent {
  return {
    summary: `A few minutes of practice for "${what}" in an everyday moment, so your child gets to try what they're learning in therapy at home too.`,
    minutes: 5,
    materials: ["The item you're practising, or something your child enjoys that goes with it"],
    steps: [
      { title: "Pick a good moment", detail: "Choose a time your child is calm and not hungry or tired, for example during play or a daily routine. Five minutes is plenty." },
      { title: "Set up the chance", detail: "Get the item you're practising ready, and make it something your child cares about in that moment. Sit or kneel at their level, face to face." },
      { title: "Show it once", detail: "Show or say what you'd like them to do, simply and clearly, just once. Keep your words short." },
      { title: "Wait", detail: "Pause and look at them expectantly. Count to five in your head. Give them time to try before you help." },
      { title: "Help just enough", detail: "If nothing happens, give a little help (see the next page), then let them finish it themselves if they can." },
      { title: "Celebrate and stop while it's fun", detail: "Praise the try, not just the result: \"You did it!\" Stop after a few goes, while it's still going well." }
    ],
    ifItsHard: [
      "Wait a little longer and look at them expectantly.",
      "Point to or gesture towards what you'd like them to do.",
      "Say it or show it, and let them copy you.",
      "Gently help with your hands, then do less of it next time."
    ],
    success: "Your child does it, on their own or with some help. Any real try counts. Notice how much help they needed: that's what you'll note when you log it.",
    keepItFun: ["Follow what your child is interested in.", "Praise the effort.", "Stop while it's going well."],
    stopIf: "Stop if your child is upset, tired or wants to stop. End on something easy they can do, and try again another day."
  };
}

/** The saved guide for a skill, drafting it with the AI the first time. Null when the AI can't. */
async function guideFor(skill: SkillForGuide, tenantId: string) {
  const saved = await prisma.skillHomeGuide.findUnique({ where: { canonicalSkillId: skill.id } });
  if (saved) return saved;
  const content = await draftWithAi(skill, tenantId);
  if (!content) return null;
  try {
    return await prisma.skillHomeGuide.create({ data: { canonicalSkillId: skill.id, content, aiDrafted: true } });
  } catch (e) {
    // Two parents opened the same new skill at once: keep the first guide.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return prisma.skillHomeGuide.findUniqueOrThrow({ where: { canonicalSkillId: skill.id } });
    throw e;
  }
}

const skillSelect = {
  id: true,
  name: true,
  description: true,
  domain: { select: { name: true } },
  defaultDiscipline: { select: { name: true } },
  items: { select: { displayName: true }, take: 8 }
} as const;

// ---------- The parent's walkthrough ----------

function itemName(i: { customText: string | null; canonicalSkillItem: { displayName: string } | null }) {
  return i.customText ?? i.canonicalSkillItem?.displayName ?? null;
}

export const homeGuidesService = {
  /** Everything the parent app needs to walk a parent through one goal's activity. */
  async walkthrough(parentId: string, kidId: string, goalId: string) {
    const kid = await assertOwnsKid(parentId, kidId);
    const goal = await prisma.goal.findFirst({
      where: { id: goalId, kidId },
      select: {
        id: true,
        title: true,
        canonicalSkill: { select: skillSelect },
        items: {
          select: {
            id: true,
            customText: true,
            canonicalSkillItem: { select: { displayName: true } },
            evidence: { orderBy: { logDate: "desc" }, select: { logDate: true, createdAt: true, supportLevel: true, centreId: true, centreName: true, centre: { select: { name: true } } } }
          }
        }
      }
    });
    if (!goal) throw notFound("Goal not found");

    // Today's item: practised at the centre but least at home; else the most recently practised; else the first.
    const scored = goal.items
      .filter((i) => itemName(i))
      .map((i) => {
        const centre = i.evidence.filter((e) => e.centreId || e.centreName);
        return { item: i, centre: centre.length, home: i.evidence.length - centre.length, last: i.evidence[0]?.logDate ?? i.evidence[0]?.createdAt ?? null };
      });
    const pick =
      [...scored].filter((s) => s.centre > s.home).sort((a, b) => a.home - b.home || (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0))[0] ??
      [...scored].sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0))[0];

    // How much help they needed the last time at the centre, so the parent knows where to start.
    const centreEntries = goal.items
      .flatMap((i) => i.evidence)
      .filter((e) => e.centreId || e.centreName)
      .sort((a, b) => (b.logDate ?? b.createdAt).getTime() - (a.logDate ?? a.createdAt).getTime());
    const last = centreEntries[0];

    // The therapist's own home-practice notes for this goal, from the newest IEP shared with the parent.
    const plans = await prisma.iepPlan.findMany({ where: { kidId, status: "FINAL", sharedAt: { not: null } }, orderBy: { sharedAt: "desc" }, select: { authorName: true, content: true } });
    let fromPlan: { authorName: string; homePractice: string[]; target: string } | null = null;
    for (const p of plans) {
      const g = (p.content as { goals?: { goalId: string; homePractice: string[]; target: string }[] }).goals?.find((x) => x.goalId === goal.id);
      if (g && (g.homePractice.length || g.target)) {
        fromPlan = { authorName: p.authorName, homePractice: g.homePractice, target: g.target };
        break;
      }
    }

    const saved = await guideFor(goal.canonicalSkill, kid.tenantId);
    return {
      goal: { id: goal.id, title: goal.title, skillName: goal.canonicalSkill.name, area: goal.canonicalSkill.domain.name },
      item: pick ? { goalItemId: pick.item.id, label: itemName(pick.item)! } : null,
      lastAtCentre: last ? { supportLevel: last.supportLevel as PocSupportLevel, centreName: last.centre?.name ?? last.centreName, date: last.logDate ?? last.createdAt } : null,
      fromPlan,
      // The general steps name the child's own goal, which reads better than the taxonomy's skill name.
      guide: saved ? (saved.content as GuideContent) : generalGuide(goal.title),
      guideKind: saved ? (saved.reviewedAt ? "reviewed" : "drafted") : "general"
    };
  },

  // ---------- Staff review (superadmin: guides are shared by every centre) ----------

  async listForReview() {
    const skills = await prisma.canonicalSkill.findMany({
      where: { OR: [{ goals: { some: { status: "ACTIVE" } } }, { homeGuide: { isNot: null } }] },
      orderBy: [{ domain: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        domain: { select: { name: true } },
        _count: { select: { goals: { where: { status: "ACTIVE" } } } },
        homeGuide: { select: { aiDrafted: true, reviewedAt: true, updatedAt: true } }
      }
    });
    return skills.map((s) => ({ skillId: s.id, skillName: s.name, area: s.domain.name, activeGoals: s._count.goals, guide: s.homeGuide }));
  },

  async getForReview(skillId: string) {
    const skill = await prisma.canonicalSkill.findUnique({ where: { id: skillId }, select: { id: true, name: true, domain: { select: { name: true } }, homeGuide: { include: { reviewedBy: { select: { name: true } } } } } });
    if (!skill) throw notFound("Skill not found");
    return { skillId: skill.id, skillName: skill.name, area: skill.domain.name, guide: skill.homeGuide, general: generalGuide(skill.name) };
  },

  /** Drafts a guide with the AI now (for skills nobody has opened yet). Keeps an existing one. */
  async draftForReview(skillId: string, tenantId: string | null) {
    const skill = await prisma.canonicalSkill.findUnique({ where: { id: skillId }, select: skillSelect });
    if (!skill) throw notFound("Skill not found");
    const saved = await guideFor(skill, tenantId ?? "platform");
    return { drafted: !!saved };
  },

  async save(skillId: string, userId: string, input: { content: GuideContent; reviewed: boolean }) {
    const skill = await prisma.canonicalSkill.findUnique({ where: { id: skillId }, select: { id: true } });
    if (!skill) throw notFound("Skill not found");
    const review = input.reviewed ? { reviewedAt: new Date(), reviewedById: userId } : { reviewedAt: null, reviewedById: null };
    return prisma.skillHomeGuide.upsert({
      where: { canonicalSkillId: skillId },
      create: { canonicalSkillId: skillId, content: input.content, aiDrafted: false, ...review },
      update: { content: input.content, ...review }
    });
  }
};
