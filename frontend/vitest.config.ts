import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Unit + component tests (jsdom). End-to-end tests live in the top-level e2e/ package.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      restoreMocks: true
    }
  })
);
