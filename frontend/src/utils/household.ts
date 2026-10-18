import type { Parent } from "../api/types";

// "Shilpa & Bhaskar" -- first names only, joined, falling back to "Household" when neither name
// is on file (e.g. a kid onboarded with just an email/mobile, names filled in later).
export function formatHouseholdName(parent: Pick<Parent, "fatherName" | "motherName">): string {
  const firstNameOf = (name: string | null) => name?.trim().split(/\s+/)[0] ?? null;
  const father = firstNameOf(parent.fatherName);
  const mother = firstNameOf(parent.motherName);
  if (father && mother) return `${mother} & ${father}`;
  return father ?? mother ?? "Household";
}
