import { prisma } from "../../config/prisma";
import { CreateCentreInput } from "./centres.schemas";

export const centresService = {
  // No tenant/role scoping -- Centre is a shared, global directory visible to every authenticated
  // staff member, same as the canonical taxonomy.
  list() {
    return prisma.centre.findMany({ orderBy: { name: "asc" } });
  },

  // Idempotent find-or-create, case-insensitive -- the picker's "add new" path should never error
  // or create a near-duplicate just because someone typed a different casing of a name that
  // already exists (the real production data had exactly this: "vListen" vs "vlisten").
  async create(input: CreateCentreInput) {
    const existing = await prisma.centre.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } });
    if (existing) return existing;
    return prisma.centre.create({ data: { name: input.name, city: input.city } });
  }
};
