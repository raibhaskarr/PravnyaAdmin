import { defineConfig, devices } from "@playwright/test";
import { ADMIN_APP_PORT, ADMIN_APP_URL, BACKEND_PORT, BACKEND_URL, PARENT_APP_PORT, PARENT_APP_URL, backendEnv } from "./support/env";

const CI = Boolean(process.env.CI);
// Optional: point at a locally installed Chromium (e.g. on machines where `npx playwright install` isn't possible).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./support/global-setup.ts",
  fullyParallel: false,
  workers: 1, // one shared database; tests create their own unique users where they write
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {}
  },
  projects: [
    {
      name: "parent-mobile",
      testDir: "./tests/parent",
      use: {
        ...devices["Pixel 7"],
        baseURL: PARENT_APP_URL,
        // A fake microphone, so voice-note logging runs its real recording code.
        permissions: ["microphone"],
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
        }
      }
    },
    {
      name: "admin-desktop",
      testDir: "./tests/admin",
      use: { ...devices["Desktop Chrome"], baseURL: ADMIN_APP_URL }
    }
  ],
  webServer: [
    {
      command: "npx tsx src/server.ts",
      cwd: "../backend",
      url: `${BACKEND_URL}/health`,
      env: backendEnv,
      reuseExistingServer: !CI,
      timeout: 120_000
    },
    {
      command: `npx vite --port ${PARENT_APP_PORT} --strictPort`,
      cwd: "../parent-app",
      url: PARENT_APP_URL,
      env: { VITE_API_BASE_URL: BACKEND_URL },
      reuseExistingServer: !CI,
      timeout: 120_000
    },
    {
      command: `npx vite --port ${ADMIN_APP_PORT} --strictPort`,
      cwd: "../frontend",
      url: ADMIN_APP_URL,
      env: { VITE_API_BASE_URL: BACKEND_URL },
      reuseExistingServer: !CI,
      timeout: 120_000
    }
  ]
});
