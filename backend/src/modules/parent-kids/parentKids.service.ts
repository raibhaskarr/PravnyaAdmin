import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { CreateParentKidInput } from "./parentKids.schemas";

// Splits a single "child's name" field into firstName/lastName -- Kid.lastName is a required,
// non-nullable column (shared with the staff-facing kids module, not changed here), so a
// single-word name gets an empty-string lastName rather than a schema change with a much wider
// blast radius (every admin screen that reads kid.lastName). A known, deliberate simplification,
// not an oversight.
function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

export const parentKidsService = {
  async createFirstKid(parentId: string, input: CreateParentKidInput) {
    if (!env.RETAIL_TENANT_ID) {
      throw new AppError(500, "RETAIL_TENANT_NOT_CONFIGURED", "Self-registration isn't fully configured yet. Contact support.");
    }
    const { firstName, lastName } = splitName(input.name);
    return prisma.kid.create({
      data: {
        tenantId: env.RETAIL_TENANT_ID,
        parentId,
        firstName,
        lastName,
        dob: new Date(input.dob),
        gender: input.gender ?? null
      },
      select: { id: true, firstName: true, lastName: true, dob: true, gender: true }
    });
  },

  async listMyKids(parentId: string) {
    return prisma.kid.findMany({
      where: { parentId },
      select: { id: true, firstName: true, lastName: true, dob: true, gender: true, status: true },
      orderBy: { createdAt: "asc" }
    });
  }
};
