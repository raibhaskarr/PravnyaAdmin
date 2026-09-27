import { prisma } from "../../config/prisma";
import { AppError, notFound } from "../../common/errors/AppError";

export const tenantDisciplinesService = {
  // Every discipline in the master list, flagged with whether this tenant currently offers it --
  // shaped for a simple toggle-list UI rather than returning only the enabled subset.
  async listForTenant(tenantId: string) {
    const [all, enabled] = await Promise.all([
      prisma.canonicalDiscipline.findMany({ orderBy: { name: "asc" } }),
      prisma.tenantDiscipline.findMany({ where: { tenantId }, select: { disciplineId: true } })
    ]);
    const enabledIds = new Set(enabled.map((e) => e.disciplineId));
    return all.map((d) => ({ ...d, enabled: enabledIds.has(d.id) }));
  },

  async enable(tenantId: string, disciplineId: string) {
    const discipline = await prisma.canonicalDiscipline.findUnique({ where: { id: disciplineId } });
    if (!discipline) throw notFound("Discipline not found");
    return prisma.tenantDiscipline.upsert({
      where: { tenantId_disciplineId: { tenantId, disciplineId } },
      update: {},
      create: { tenantId, disciplineId }
    });
  },

  async disable(tenantId: string, disciplineId: string) {
    const inUse = await prisma.therapist.count({ where: { tenantId, disciplineIds: { has: disciplineId } } });
    if (inUse > 0) {
      throw new AppError(400, "DISCIPLINE_IN_USE", "A therapist is still assigned to this discipline");
    }
    await prisma.tenantDiscipline.deleteMany({ where: { tenantId, disciplineId } });
  }
};
