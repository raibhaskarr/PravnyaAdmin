import bcrypt from "bcryptjs";
import { PrismaClient, type PocEvidenceOutcome, type PocSupportLevel } from "@prisma/client";

// A made-up demo family for local demos and the E2E suite: one parent, one child ("Mira Demo")
// with goals, a couple of months of logged sessions at home and at a centre, a linked therapist
// and a weekly schedule slot. Entirely synthetic -- use this instead of copying a real family.
//
//   npm run seed && npm run seed:demo      (taxonomy first: goals point at canonical skills)
//
// Re-running replaces the previous demo family. Refuses to run against a non-local database.

export const DEMO_PARENT_EMAIL = "demo.parent@demo.pravnya.test";
export const DEMO_PARENT_PASSWORD = "Demo-parent-123";
export const DEMO_THERAPIST_EMAIL = "demo.therapist@demo.pravnya.test";
export const DEMO_KID_FIRST_NAME = "Mira";

const prisma = new PrismaClient();

function assertLocalDatabase() {
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      return "";
    }
  })();
  if (!["localhost", "127.0.0.1", "postgres", "db"].includes(host)) {
    throw new Error(`seed-demo only runs against a local database (DATABASE_URL host is "${host || "unset"}").`);
  }
}

// Small deterministic PRNG so every run (and every CI run) produces identical data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Early sessions need more help; later ones trend independent -- so Growth has a story to show.
function sessionResult(progress: number, rand: () => number): { outcome: PocEvidenceOutcome; supportLevel: PocSupportLevel } {
  const r = rand() * 0.35 + progress * 0.65;
  if (r > 0.75) return { outcome: "CORRECT", supportLevel: "INDEPENDENT" };
  if (r > 0.55) return { outcome: "CORRECT", supportLevel: "VERBAL_PROMPT" };
  if (r > 0.35) return { outcome: "PARTIAL", supportLevel: "GESTURAL_PROMPT" };
  return { outcome: "ATTEMPTED", supportLevel: "PHYSICAL_PROMPT" };
}

async function main() {
  assertLocalDatabase();
  const rand = mulberry32(20261112);

  const skills = await prisma.canonicalSkill.findMany({
    where: { supportsItems: true, items: { some: {} } },
    include: { items: { orderBy: { key: "asc" }, take: 3 } },
    orderBy: { key: "asc" },
    take: 6
  });
  if (skills.length === 0) throw new Error("No canonical skills found -- run `npm run seed` first.");
  const fallbackDiscipline = await prisma.canonicalDiscipline.findFirstOrThrow({ orderBy: { key: "asc" } });

  // Replace any previous demo family.
  const previous = await prisma.parent.findUnique({ where: { email: DEMO_PARENT_EMAIL } });
  if (previous) {
    await prisma.kid.deleteMany({ where: { parentId: previous.id } });
    await prisma.parent.delete({ where: { id: previous.id } });
  }
  await prisma.user.deleteMany({ where: { email: DEMO_THERAPIST_EMAIL } });

  const tenantId = process.env.RETAIL_TENANT_ID;
  const tenant = tenantId
    ? await prisma.tenant.upsert({ where: { id: tenantId }, update: {}, create: { id: tenantId, name: "Pravnix Labs (demo)", slug: "retail-demo" } })
    : await prisma.tenant.upsert({ where: { slug: "retail-demo" }, update: {}, create: { name: "Pravnix Labs (demo)", slug: "retail-demo" } });

  const centre = await prisma.centre.upsert({
    where: { name: "Sunrise Therapy Centre (demo)" },
    update: {},
    create: { name: "Sunrise Therapy Centre (demo)", city: "Pune" }
  });

  const parent = await prisma.parent.create({
    data: {
      email: DEMO_PARENT_EMAIL,
      displayName: "Demo Parent",
      passwordHash: await bcrypt.hash(DEMO_PARENT_PASSWORD, 10),
      emailVerifiedAt: new Date()
    }
  });

  const kid = await prisma.kid.create({
    data: {
      tenantId: tenant.id,
      parentId: parent.id,
      firstName: DEMO_KID_FIRST_NAME,
      lastName: "Demo",
      dob: new Date("2020-06-15T00:00:00Z"),
      gender: "Female",
      selfReportedTherapies: ["Speech therapy", "Occupational therapy"],
      selfReportedScheduleDays: ["Mon", "Thu"]
    }
  });

  const therapistUser = await prisma.user.create({
    data: {
      email: DEMO_THERAPIST_EMAIL,
      name: "Demo Therapist",
      role: "THERAPIST",
      tenantId: tenant.id,
      passwordHash: await bcrypt.hash(DEMO_PARENT_PASSWORD, 10)
    }
  });
  const therapist = await prisma.therapist.create({ data: { tenantId: tenant.id, userId: therapistUser.id, name: "Demo Therapist" } });
  await prisma.kidTherapist.create({ data: { kidId: kid.id, therapistId: therapist.id } });
  await prisma.scheduleSlot.create({ data: { kidId: kid.id, label: "Speech therapy", dayOfWeek: "Mon", startTime: "16:00", therapistId: therapist.id } });

  const DAYS = 56;
  let entries = 0;
  for (const [i, skill] of skills.entries()) {
    const goal = await prisma.goal.create({
      data: {
        tenantId: tenant.id,
        kidId: kid.id,
        canonicalSkillId: skill.id,
        disciplineId: skill.defaultDisciplineId ?? fallbackDiscipline.id,
        modality: "VERBAL",
        title: `${skill.name} independently`,
        // Half "from the care team", half "from an IEP upload", so both labels show up.
        createdById: i % 2 === 0 ? therapistUser.id : null,
        centreId: centre.id
      }
    });
    for (const item of skill.items) {
      const goalItem = await prisma.goalItem.create({ data: { goalId: goal.id, canonicalSkillItemId: item.id } });
      // Roughly two sessions a week per item over the last 8 weeks.
      for (let day = DAYS; day >= 1; day -= 3 + Math.floor(rand() * 2)) {
        const atCentre = rand() < 0.5;
        await prisma.goalItemEvidence.create({
          data: {
            goalItemId: goalItem.id,
            logDate: new Date(Date.now() - day * 86_400_000),
            centreId: atCentre ? centre.id : null,
            centreName: atCentre ? centre.name : null,
            modality: "VERBAL",
            ...sessionResult(1 - day / DAYS, rand)
          }
        });
        entries++;
      }
    }
  }

  console.log(
    `Seeded demo family: ${DEMO_PARENT_EMAIL} / ${DEMO_PARENT_PASSWORD} -- child ${DEMO_KID_FIRST_NAME} with ${skills.length} goals and ${entries} logged sessions`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
