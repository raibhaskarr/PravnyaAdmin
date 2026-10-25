import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid, kidVisibilityFilter } from "../../common/access/kidAccess";
import { CreateEvidenceInput, CreateGoalInput, UpdateEvidenceInput, UpdateGoalInput } from "./goals.schemas";

const centreSelect = { select: { id: true, name: true } };

const includeRelations = {
  kid: { select: { id: true, firstName: true, lastName: true } },
  canonicalSkill: { select: { id: true, name: true, measurementType: true, domain: { select: { id: true, name: true } } } },
  discipline: { select: { id: true, name: true } },
  centre: centreSelect,
  items: {
    include: {
      canonicalSkillItem: { select: { id: true, displayName: true } },
      evidence: { orderBy: { logDate: "desc" as const }, include: { centre: centreSelect } }
    }
  }
};

export const goalsService = {
  async list(user: AuthUser, kidId?: string) {
    if (kidId) {
      await assertCanAccessKid(user, kidId);
      return prisma.goal.findMany({ where: { kidId }, include: includeRelations, orderBy: { createdAt: "desc" } });
    }
    const kidFilter = await kidVisibilityFilter(user);
    const visibleKids = await prisma.kid.findMany({ where: kidFilter, select: { id: true } });
    return prisma.goal.findMany({
      where: { kidId: { in: visibleKids.map((k) => k.id) } },
      include: includeRelations,
      orderBy: { createdAt: "desc" }
    });
  },

  async get(user: AuthUser, goalId: string) {
    const goal = await prisma.goal.findUnique({ where: { id: goalId }, include: includeRelations });
    if (!goal) throw notFound("Goal not found");
    await assertCanAccessKid(user, goal.kidId);
    return goal;
  },

  async create(user: AuthUser, input: CreateGoalInput) {
    // Tag the goal to the KID's own tenant, not the creating user's -- a guest therapist from
    // another tenant can create a goal here (see kidAccess.ts), and it must still belong to the
    // kid's own tenant, never the guest's.
    const kid = await assertCanAccessKid(user, input.kidId);
    return prisma.goal.create({
      data: {
        tenantId: kid.tenantId,
        kidId: input.kidId,
        canonicalSkillId: input.canonicalSkillId,
        disciplineId: input.disciplineId,
        modality: input.modality,
        title: input.title,
        notes: input.notes,
        centreId: input.centreId ?? null,
        confidence: input.confidence ?? null,
        rationale: input.rationale ?? null,
        createdById: user.id,
        updatedById: user.id,
        items: {
          create: input.items.map((item) => ({
            canonicalSkillItemId: item.canonicalSkillItemId,
            customText: item.customText
          }))
        }
      },
      include: includeRelations
    });
  },

  async update(user: AuthUser, goalId: string, input: UpdateGoalInput) {
    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) throw notFound("Goal not found");
    await assertCanAccessKid(user, goal.kidId);

    const { items, ...fields } = input;

    if (items !== undefined) {
      await prisma.goalItem.deleteMany({ where: { goalId } });
      await prisma.goalItem.createMany({
        data: items.map((item) => ({ goalId, canonicalSkillItemId: item.canonicalSkillItemId, customText: item.customText }))
      });
    }

    return prisma.goal.update({
      where: { id: goalId },
      data: { ...fields, updatedById: user.id },
      include: includeRelations
    });
  },

  // A therapist logging a session rarely wants to pre-create items first -- resolve (or create)
  // the right GoalItem inline: an explicit goalItemId, a new custom-text item typed on the spot, or
  // the shared "general practice" bucket (customText null, canonicalSkillItemId null) when neither
  // is given. Never creates a second "general practice" row for the same goal.
  async createEvidence(user: AuthUser, goalId: string, input: CreateEvidenceInput) {
    const goal = await prisma.goal.findUnique({ where: { id: goalId }, include: { canonicalSkill: { select: { measurementType: true } } } });
    if (!goal) throw notFound("Goal not found");
    await assertCanAccessKid(user, goal.kidId);

    let goalItemId = input.goalItemId;
    if (!goalItemId) {
      const customText = input.newItemCustomText?.trim() || null;
      const existing = await prisma.goalItem.findFirst({
        where: customText ? { goalId, customText: { equals: customText, mode: "insensitive" } } : { goalId, customText: null, canonicalSkillItemId: null }
      });
      const item = existing ?? (await prisma.goalItem.create({ data: { goalId, customText } }));
      goalItemId = item.id;
    } else {
      const item = await prisma.goalItem.findUnique({ where: { id: goalItemId } });
      if (!item || item.goalId !== goalId) throw notFound("Goal item not found on this goal");
    }

    return prisma.goalItemEvidence.create({
      data: {
        goalItemId,
        logDate: new Date(input.logDate),
        centreId: input.centreId ?? null,
        outcome: input.outcome,
        supportLevel: input.supportLevel,
        modality: input.modality,
        measurementType: goal.canonicalSkill.measurementType,
        measurementValue: input.measurementValue ?? null,
        measurementUnit: input.measurementUnit ?? null,
        measurementBoolean: input.measurementBoolean ?? null,
        measurementText: input.measurementText ?? null
      },
      include: {
        centre: centreSelect,
        goalItem: { select: { id: true, customText: true, canonicalSkillItem: { select: { id: true, displayName: true } } } }
      }
    });
  },

  // Deliberately narrow -- see the updateEvidenceSchema comment. Only centreId, since that's the
  // one thing that's turned out to be wrong after the fact in practice (an AI-assisted upload
  // attributed to the wrong clinic); the rest of a logged evidence row is what was actually
  // observed in the session and isn't meant to change later.
  async updateEvidence(user: AuthUser, goalId: string, evidenceId: string, input: UpdateEvidenceInput) {
    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) throw notFound("Goal not found");
    await assertCanAccessKid(user, goal.kidId);

    const evidence = await prisma.goalItemEvidence.findUnique({ where: { id: evidenceId }, include: { goalItem: { select: { goalId: true } } } });
    if (!evidence || evidence.goalItem.goalId !== goalId) throw notFound("Evidence not found on this goal");

    return prisma.goalItemEvidence.update({
      where: { id: evidenceId },
      data: { centreId: input.centreId },
      include: {
        centre: centreSelect,
        goalItem: { select: { id: true, customText: true, canonicalSkillItem: { select: { id: true, displayName: true } } } }
      }
    });
  }
};
