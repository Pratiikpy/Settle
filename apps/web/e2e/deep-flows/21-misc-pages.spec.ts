/**
 * Deep flow #21 — Misc pages render with content (read-only verifications)
 *
 * Each test: navigate, wait for hydrate, verify main has content.
 * These cover UI surfaces that don't have action flows but still need
 * to render correctly for connected users.
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

const ROUTES = [
  { path: "/dashboard", name: "Dashboard" },
  { path: "/cards", name: "Cards list" },
  { path: "/notifications", name: "Notifications inbox" },
  { path: "/activity", name: "Activity inbox" },
  { path: "/feed", name: "Public feed" },
  { path: "/leaderboard", name: "Leaderboard" },
  { path: "/control-center", name: "Control center" },
  { path: "/help", name: "Help" },
  { path: "/changelog", name: "Changelog" },
];

for (const { path, name } of ROUTES) {
  test(`DEEP-21 [${path}]: ${name} renders for connected wallet`, async ({ browser }) => {
    test.setTimeout(60_000);
    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    const page = await aliceCtx.newPage();
    try {
      await connectBurner(page);
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await waitForW6Hydrated(page);
      await page.waitForTimeout(2_000);

      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 15_000 });
      const text = await main.textContent();
      expect(text?.trim().length ?? 0, `${path} has content`).toBeGreaterThan(20);

      // No "500 Internal Server Error" text
      expect(text).not.toMatch(/500.*internal|server error/i);

      console.log(`[DEEP-21 ${path}] content length: ${text?.length}`);
    } finally {
      await aliceCtx.close();
    }
  });
}
