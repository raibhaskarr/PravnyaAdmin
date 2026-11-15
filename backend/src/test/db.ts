import { prisma } from "../config/prisma";
import { testOutbox } from "../modules/therapist-invitations/invitationEmail.service";
import { clearTestAiResponses } from "../modules/ai/ai.platform";

// Integration tests wipe every table between tests, so they must never point at a real database.
// Refuses to run unless the database name says it's a throwaway one (CI uses pravnyaadmin_ci,
// local runs use a *_test database from backend/.env.test).
export function assertTestDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  let dbName = "";
  try {
    dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    // fall through to the error below
  }
  if (!/(test|_ci)/i.test(dbName)) {
    throw new Error(
      `Refusing to run integration tests against database "${dbName || "(unparseable DATABASE_URL)"}" -- ` +
        `its name must contain "test" or "_ci". Set DATABASE_URL in backend/.env.test.`
    );
  }
}

/** Empties every application table (keeps the migration history), the test outbox and any scripted AI responses. */
export async function resetDb() {
  assertTestDatabase();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
  testOutbox.length = 0;
  clearTestAiResponses();
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
