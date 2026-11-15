import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backendEnv } from "./env";

// Fresh database for every run: migrate, empty, then seed taxonomy + superadmin + the demo family.
export default function globalSetup() {
  const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend");
  const run = (cmd: string) => execSync(cmd, { cwd: backendDir, stdio: "inherit", env: { ...process.env, ...backendEnv } });
  run("npx prisma migrate deploy");
  run("npx tsx src/test/resetDb.cli.ts");
  run("npx tsx prisma/seed.ts");
  run("npx tsx prisma/seed-demo.ts");
}
