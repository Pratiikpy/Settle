import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * One-shot screenshot capture for the README hero + 4-panel grid.
 *
 * Run with:
 *   pnpm --filter web exec playwright test e2e/capture-screenshots.spec.ts
 *
 * Outputs:
 *   docs/screenshots/hero.png
 *   docs/screenshots/panel-watch.png
 *   docs/screenshots/panel-receipt.png
 *   docs/screenshots/panel-dashboard.png
 *   docs/screenshots/panel-crosschain.png
 *
 * Filenames + viewport match the capture guide in docs/screenshots/README.md
 * exactly so the README's image references render without further edits.
 */

// Resolve the repo's docs/screenshots dir. Playwright's CWD is apps/web,
// so the screenshots directory is two levels up.
const SHOTS_DIR = join(process.cwd(), "..", "..", "docs", "screenshots");
const VIEWPORT = { width: 1280, height: 800 } as const;

mkdirSync(SHOTS_DIR, { recursive: true });

test.describe.configure({ mode: "serial" });

test.describe("Capture README screenshots", () => {
  test("hero — landing magic-moment terminal", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/?stay=1");
    await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
    // Give the magic-moment terminal a moment to populate at least one row.
    // Falls back to a clean static frame if the live data isn't there.
    await page.waitForTimeout(2_500);
    await page.screenshot({
      path: join(SHOTS_DIR, "hero.png"),
      fullPage: false,
    });
  });

  test("panel-watch — /watch agent demo", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/watch");
    await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(2_500);
    await page.screenshot({
      path: join(SHOTS_DIR, "panel-watch.png"),
      fullPage: false,
    });
  });

  test("panel-receipt — /r/<id> poster", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    // Pick a deterministic receipt page. /r/sample is a static-rendered route
    // and was used elsewhere in the suite for visual baselines. If it 404s,
    // fall back to a known live receipt UUID set via env.
    const fallback = process.env.E2E_SAMPLE_RECEIPT_ID ?? "";
    const url = fallback ? `/r/${fallback}` : "/r/sample";
    const res = await page.goto(url);
    // If sample 404s and no fallback, capture /verify as a substitute (also
    // shows the hash-chain rendering).
    if (res && res.status() === 404 && !fallback) {
      await page.goto("/verify");
    }
    await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await page.screenshot({
      path: join(SHOTS_DIR, "panel-receipt.png"),
      fullPage: false,
    });
  });

  test("panel-dashboard — connected /dashboard", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/");
    await connectBurner(page);
    await page.goto("/dashboard");
    await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
    // Wait long enough for /api/dashboard/v6 + /api/balance to land so the
    // bento cells aren't all skeleton.
    await page.waitForTimeout(3_500);
    await page.screenshot({
      path: join(SHOTS_DIR, "panel-dashboard.png"),
      fullPage: false,
    });
  });

  test("panel-crosschain — /watch-crosschain", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/watch-crosschain");
    await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await page.screenshot({
      path: join(SHOTS_DIR, "panel-crosschain.png"),
      fullPage: false,
    });
  });
});

// Sanity check at the end — verify every file exists.
test("verify all screenshots written", async () => {
  const fs = await import("node:fs/promises");
  const files = [
    "hero.png",
    "panel-watch.png",
    "panel-receipt.png",
    "panel-dashboard.png",
    "panel-crosschain.png",
  ];
  for (const name of files) {
    const stat = await fs.stat(join(SHOTS_DIR, name));
    expect(stat.size).toBeGreaterThan(5_000);
    expect(stat.size).toBeLessThan(2_500_000);
  }
});
