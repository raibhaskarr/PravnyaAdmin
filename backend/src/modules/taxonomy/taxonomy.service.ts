import { prisma } from "../../config/prisma";
import { notFound } from "../../common/errors/AppError";

export const taxonomyService = {
  listDisciplines() {
    return prisma.canonicalDiscipline.findMany({ orderBy: { name: "asc" } });
  },

  createDiscipline(input: { key: string; name: string }) {
    return prisma.canonicalDiscipline.create({ data: input });
  },

  async updateDiscipline(id: string, input: { name?: string }) {
    await this.getDiscipline(id);
    return prisma.canonicalDiscipline.update({ where: { id }, data: input });
  },

  async getDiscipline(id: string) {
    const row = await prisma.canonicalDiscipline.findUnique({ where: { id } });
    if (!row) throw notFound("Discipline not found");
    return row;
  },

  listDomains() {
    return prisma.canonicalDomain.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { skills: true } } }
    });
  },

  createDomain(input: { key: string; name: string; sortOrder: number }) {
    return prisma.canonicalDomain.create({ data: input });
  },

  async updateDomain(id: string, input: { name?: string; sortOrder?: number }) {
    await this.getDomain(id);
    return prisma.canonicalDomain.update({ where: { id }, data: input });
  },

  async getDomain(id: string) {
    const row = await prisma.canonicalDomain.findUnique({ where: { id } });
    if (!row) throw notFound("Domain not found");
    return row;
  },

  listSkills(domainId?: string) {
    return prisma.canonicalSkill.findMany({
      where: domainId ? { domainId } : undefined,
      orderBy: { name: "asc" },
      include: { domain: true, defaultDiscipline: true, _count: { select: { items: true } } }
    });
  },

  async getSkill(id: string) {
    const skill = await prisma.canonicalSkill.findUnique({
      where: { id },
      include: { domain: true, defaultDiscipline: true, items: { orderBy: { displayName: "asc" } } }
    });
    if (!skill) throw notFound("Skill not found");
    return skill;
  },

  createSkill(input: {
    domainId: string;
    key: string;
    name: string;
    description?: string;
    defaultDisciplineId?: string;
    supportsItems: boolean;
    sourceTag: "PROD" | "FRAMEWORK";
  }) {
    return prisma.canonicalSkill.create({ data: input });
  },

  async updateSkill(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      defaultDisciplineId?: string | null;
      supportsItems?: boolean;
      sourceTag?: "PROD" | "FRAMEWORK";
    }
  ) {
    await this.getSkill(id);
    return prisma.canonicalSkill.update({ where: { id }, data: input });
  },

  async createItem(
    skillId: string,
    input: { key: string; displayName: string; semanticGroup: string; aliases?: string[] }
  ) {
    await this.getSkill(skillId);
    return prisma.canonicalSkillItem.create({
      data: { skillId, key: input.key, displayName: input.displayName, semanticGroup: input.semanticGroup, aliases: input.aliases ?? undefined }
    });
  },

  async updateItem(id: string, input: { displayName?: string; semanticGroup?: string; aliases?: string[] }) {
    const item = await prisma.canonicalSkillItem.findUnique({ where: { id } });
    if (!item) throw notFound("Item not found");
    return prisma.canonicalSkillItem.update({
      where: { id },
      data: { ...input, aliases: input.aliases ?? undefined }
    });
  },

  async deleteItem(id: string) {
    const item = await prisma.canonicalSkillItem.findUnique({ where: { id } });
    if (!item) throw notFound("Item not found");
    await prisma.canonicalSkillItem.delete({ where: { id } });
  }
};
