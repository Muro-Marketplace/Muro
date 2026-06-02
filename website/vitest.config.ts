import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest — unit + integration tests. Co-located `.test.ts` files next to
// the module under test, plus `tests/integration/*.test.ts` for anything
// that touches more than one module (mocked Supabase, etc.).
//
// Playwright lives in tests/e2e/ and is run separately (see playwright.config.ts).

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    exclude: [
      "node_modules/**",
      ".next/**",
      "tests/e2e/**",
    ],
    // Generous timeouts — integration tests may hit slow mocks
    testTimeout: 10_000,
    // Pool workers to avoid Supabase rate-limit flakes when we wire real DB tests
    pool: "threads",
    poolOptions: { threads: { singleThread: false } },
    // Don't spin up a dev server automatically — tests shouldn't depend on one
    // for unit/integration. Playwright has its own webServer config.
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: process.env.CI ? "./test-results/vitest.xml" : undefined,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
