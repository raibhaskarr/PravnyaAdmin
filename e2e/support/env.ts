// One place for the E2E stack's ports and test-only config. Separate ports from the usual dev
// servers (4011/5173/5176) so running E2E never collides with -- or reuses -- a dev stack.
export const BACKEND_PORT = 4111;
export const PARENT_APP_PORT = 5273;
export const ADMIN_APP_PORT = 5276;
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
export const PARENT_APP_URL = `http://localhost:${PARENT_APP_PORT}`;
export const ADMIN_APP_URL = `http://localhost:${ADMIN_APP_PORT}`;

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://pravnyaadmin_app:localdev@localhost:5433/pravnya_e2e_test?schema=admin";

export const RETAIL_TENANT_ID = "00000000-0000-4000-8000-000000000001";

/** Environment for every backend process the suite starts (server, migrations, seeds). */
export const backendEnv = {
  NODE_ENV: "test",
  PORT: String(BACKEND_PORT),
  DATABASE_URL: E2E_DATABASE_URL,
  JWT_SECRET: "e2e-test-secret-at-least-32-characters-long",
  CORS_ORIGIN: `${PARENT_APP_URL},${ADMIN_APP_URL}`,
  EMAIL_PROVIDER: "memory",
  BCRYPT_SALT_ROUNDS: "4",
  RETAIL_TENANT_ID,
  APP_BASE_URL: ADMIN_APP_URL
};

// Credentials created by the seeds (backend/prisma/seed.ts and seed-demo.ts).
export const SUPERADMIN = { email: "superadmin@pravnya.com", password: "local-dev-only-change-me" };
export const DEMO_PARENT = { email: "demo.parent@demo.pravnya.test", password: "Demo-parent-123", kidName: "Mira" };
