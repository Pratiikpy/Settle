import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the @settle/web E2E test suite.
 *
 * Run with the burner wallet adapter enabled:
 *   NEXT_PUBLIC_E2E_BURNER=1 pnpm --filter @settle/web dev
 *   pnpm --filter @settle/web exec playwright test
 *
 * The dev server should already be running on localhost:3000 when the
 * suite starts (we don't auto-start it because the env var must be
 * present at compile time).
 */
export default defineConfig({
  testDir: "./e2e",
  // Each test creates its own browser context (no shared localStorage),
  // and persona-seeded contexts are spawned per-test via openPersonaContext.
  // True parallelism is safe because of context isolation; the
  // visual-regression file marks itself serial internally.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : 4,
  // Next.js dev server compiles routes on first hit (30-60s cold). Bump
  // the per-test timeout so cold-compile doesn't fail tests. After warm-up
  // the compile is cached and tests run fast.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
