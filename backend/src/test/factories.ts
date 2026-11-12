import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Modality, PocEvidenceOutcome, PocSupportLevel, UserRole } from "@prisma/client";
import { prisma } from "../config/prisma";
import { signToken } from "../common/middleware/auth";
import { signParentToken } from "../common/middleware/parentAuth";

// Small builders for integration tests. Every value is synthetic -- never put real family data in
// tests or fixtures. Each call makes unique emails/keys so tests can create as many as they need.

export const TEST_PASSWORD = "Test-password-123";
// Low cost factor: these hashes only ever exist in a throwaway test database.
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

const uid = () => randomUUID().slice(0, 8);

export async function makeTenant(overrides: { name?: string } = {}) {
  const suffix = uid();
  return prisma.tenant.create({ data: { name: overrides.name ?? `Test Centre ${suffix}`, slug: `test-centre-${suffix}` } });
}

/** The B2C tenant self-registered parents' kids belong to (env RETAIL_TENANT_ID). */
export async function makeRetailTenant() {
  const id = process.env.RETAIL_TENANT_ID;
  if (!id) throw new Error("RETAIL_TENANT_ID must be set for tests (see backend/.env.test.example)");
  return prisma.tenant.create({ data: { id, name: "Pravnix Labs (test)", slug: "retail-test" } });
}

export async function makeUser(role: UserRole, tenantId: string | null) {
  const user = await prisma.user.create({
    data: { email: `${role.toLowerCase()}-${uid()}@test.local`, name: `Test ${role}`, role, tenantId, passwordHash }
  });
  return { user, token: signToken({ id: user.id, role: user.role, tenantId: user.tenantId }) };
}

export async function makeTherapist(tenantId: string) {
  const { user, token } = await makeUser("THERAPIST", tenantId);
  const therapist = await prisma.therapist.create({ data: { tenantId, userId: user.id, name: user.name } });
  return { user, token, therapist };
}

export async function makeParent(overrides: { name?: string } = {}) {
  const parent = await prisma.parent.create({
    data: { email: `parent-${uid()}@test.local`, displayName: overrides.name ?? "Test Parent", passwordHash, emailVerifiedAt: new Date() }
  });
  return { parent, token: signParentToken(parent.id) };
}

export async function makeKid(tenantId: string, parentId: string | null, overrides: { firstName?: string } = {}) {
  return prisma.kid.create({ data: { tenantId, parentId, firstName: overrides.firstName ?? "Sam", lastName: "Testchild" } });
}

export async function linkTherapist(kidId: string, therapistId: string) {
  return prisma.kidTherapist.create({ data: { kidId, therapistId } });
}

/** A minimal discipline -> domain -> skill -> item chain for goals to point at. */
export async function makeTaxonomy() {
  const s = uid();
  const discipline = await prisma.canonicalDiscipline.create({ data: { key: `slp-${s}`, name: "Speech-Language Pathology" } });
  const domain = await prisma.canonicalDomain.create({ data: { key: `expressive-${s}`, name: "Expressive Language" } });
  const skill = await prisma.canonicalSkill.create({
    data: { key: `labels-objects-${s}`, name: "Labels familiar objects", domainId: domain.id, defaultDisciplineId: discipline.id, supportsItems: true }
  });
  const items = await Promise.all(
    ["Ball", "Cup", "Dog"].map((name) =>
      prisma.canonicalSkillItem.create({ data: { skillId: skill.id, key: name.toLowerCase(), displayName: name } })
    )
  );
  return { discipline, domain, skill, items };
}

type EvidenceInput = { daysAgo: number; outcome?: PocEvidenceOutcome; supportLevel?: PocSupportLevel; centreName?: string | null };

/** A goal with one goal item per taxonomy item, plus optional evidence on the first item. */
export async function makeGoal(
  kid: { id: string; tenantId: string },
  taxonomy: Awaited<ReturnType<typeof makeTaxonomy>>,
  opts: { title?: string; modality?: Modality; createdById?: string | null; evidence?: EvidenceInput[] } = {}
) {
  const goal = await prisma.goal.create({
    data: {
      tenantId: kid.tenantId,
      kidId: kid.id,
      canonicalSkillId: taxonomy.skill.id,
      disciplineId: taxonomy.discipline.id,
      modality: opts.modality ?? "VERBAL",
      title: opts.title ?? "Label familiar objects independently",
      createdById: opts.createdById ?? null
    }
  });
  const goalItems = await Promise.all(
    taxonomy.items.map((item) => prisma.goalItem.create({ data: { goalId: goal.id, canonicalSkillItemId: item.id } }))
  );
  for (const e of opts.evidence ?? []) {
    await prisma.goalItemEvidence.create({
      data: {
        goalItemId: goalItems[0].id,
        logDate: new Date(Date.now() - e.daysAgo * 86_400_000),
        outcome: e.outcome ?? "CORRECT",
        supportLevel: e.supportLevel ?? "INDEPENDENT",
        centreName: e.centreName ?? null
      }
    });
  }
  return { goal, goalItems };
}
