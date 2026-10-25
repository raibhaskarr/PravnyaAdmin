import { prisma } from "../../config/prisma";
import { CreateCentreInput } from "./parentCentres.schemas";

// Mirrors centres/centres.service.ts's list()/create() exactly -- Centre isn't owned by either
// side, it's the same shared directory regardless of who's reading/creating it.
export const parentCentresService = {
  list() {
    return prisma.centre.findMany({ orderBy: { name: "asc" } });
  },

  async create(input: CreateCentreInput) {
    const existing = await prisma.centre.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } });
    if (existing) return existing;
    return prisma.centre.create({ data: { name: input.name, city: input.city } });
  }
};
