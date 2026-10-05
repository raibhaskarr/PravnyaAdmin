import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid, kidVisibilityFilter } from "../../common/access/kidAccess";
import { CreateGoalInput, UpdateGoalInput } from "./goals.schemas";

const includeRelations = {
  kid: { select: { id: true, firstName: true, lastName: true } },
  canonicalSkill: { select: { id: true, name: true, domain: { select: { id: true, name: true } } } },
  discipline: { select: { id: true, name: true } },
  items: {
    include: {
      canonicalSkillItem: { select: { id: true, displayName: true } },
      evidence: { orderBy: { logDate: "desc" as const } }
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
    await assertCanAccessKid(user, input.kidId);
    return prisma.goal.create({
      data: {
        tenantId: user.tenantId!,
        kidId: input.kidId,
        canonicalSkillId: input.canonicalSkillId,
        disciplineId: input.disciplineId,
        modality: input.modality,
        title: input.title,
        notes: input.notes,
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
  }
};
