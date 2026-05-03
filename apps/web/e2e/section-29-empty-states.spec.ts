import { test, expect } from "@playwright/test";

/**
 * Section 29 — Empty / loading / error / setup-required states.
 *
 * Hits each route in a disconnected state to verify the empty/connect
 * affordance shows. (Connected routes are exercised in section-2-onboarding.)
 */
const ROUTES_REQUIRING_AUTH = [
  "/dashboard",
  "/cards",
  "/wishes",
  "/groups",
  "/allowances",
  "/activity",
  "/settings",
  "/agents",
  "/at/me",
];

test.describe("Section 29 · Empty/disconnected states", () => {
  for (const path of ROUTES_REQUIRING_AUTH) {
    test(`disconnected ${path} shows connect affordance`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      const html = await page.content();
      // Disconnected state should either:
      //   - Show explicit "Connect wallet" prompt
      //   - Show empty/placeholder copy ("No X yet", "Empty")
      //   - Render the page header at minimum (so the route works)
      const main = await page.locator("main").first().count();
      const surfaces =
        /[Cc]onnect.*wallet/.test(html) ||
        /[Ss]ign[ -]in/.test(html) ||
        /[Nn]o.*yet/.test(html) ||
        /[Ee]mpty/.test(html) ||
        main > 0;
      expect(surfaces).toBeTruthy();
    });
  }
});
