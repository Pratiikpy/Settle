import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env.local into process.env before Playwright spawns worker processes.
// Workers inherit process.env from this main config process.
(function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
})();

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
      // Demo-recorder specs are run via dedicated chromium-demo* projects
      // (1080p viewport + always-record video). Excluding them here keeps
      // normal Playwright runs fast and avoids spurious video artifacts.
      testIgnore: /(demo-recorder(-(wallet|broll|landing))?|autonomous-judge|phantom-(real|signing|everything|multiwallet|final-mile|iter4|iter5|iter6|iter8-verify|iter9|iter10|iter11|iter12|iter13|iter14|iter15|iter16|iter18|iter19|iter20|iter21|iter22|iter23))\.spec\.ts$/,
    },
    {
      // Hackathon demo recorder — 1080p production tour. Always records
      // video, headed, no retries (clean take preferred over re-runs).
      // Run with: pnpm exec playwright test e2e/demo-recorder.spec.ts --project=chromium-demo --headed
      name: "chromium-demo",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        video: { mode: "on", size: { width: 1920, height: 1080 } },
      },
      retries: 0,
      testMatch: /demo-recorder\.spec\.ts$/,
    },
    {
      // Wallet-flow + B-roll recorder — also 1080p so the final cut
      // is uniform. Drives the audit-branch preview where the Persona
      // burner adapter is enabled.
      // Run with: pnpm exec playwright test e2e/demo-recorder-wallet.spec.ts --project=chromium-demo-wallet --headed
      name: "chromium-demo-wallet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        video: { mode: "on", size: { width: 1920, height: 1080 } },
      },
      retries: 0,
      testMatch: /demo-recorder-(wallet|broll|landing)\.spec\.ts$/,
    },
    {
      // Autonomous judge-pass — drives the burner-enabled preview through
      // every public + authed surface, captures screenshots, generates
      // a markdown report. Exercises real on-chain devnet signing.
      // Run with: pnpm --filter @settle/web exec playwright test \
      //   e2e/autonomous-judge.spec.ts --project=chromium-burner --headed --workers=1
      name: "chromium-burner",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
      retries: 0,
      testMatch: /autonomous-judge\.spec\.ts$/,
    },
    {
      // Real Phantom extension QA — see e2e/phantom-qa/MISSION.md
      name: "chromium-phantom",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        // Phantom extension MUST run headed (extensions blocked in headless)
        headless: false,
      },
      retries: 0,
      testMatch: /phantom-(real|signing|everything|multiwallet|final-mile|iter4|iter5|iter6|iter8-verify|iter9|iter10|iter11|iter12|iter13|iter14|iter15|iter16|iter18|iter19|iter20|iter21|iter22|iter23)\.spec\.ts$/,
    },
  ],
});
