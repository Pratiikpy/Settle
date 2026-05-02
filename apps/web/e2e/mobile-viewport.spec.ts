import { test, expect } from "@playwright/test";

/**
 * Layer B mobile viewport — phase 5 surfaces should at least render
 * cleanly at iPhone-14-width without horizontal scroll or invisible
 * primary CTAs.
 *
 * Uses raw viewport override (390×844) instead of the iPhone-14
 * device descriptor so we stay on Chromium (no webkit dep). The
 * regression we care about — horizontal overflow at narrow widths —
 * is engine-agnostic.
 */

const MOBILE_ROUTES = ["/dashboard", "/cards", "/wishes", "/allowances", "/send"];
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.use({ viewport: MOBILE_VIEWPORT });

test.describe("Layer B — mobile viewport (iPhone-14 width, Chromium)", () => {
  for (const path of MOBILE_ROUTES) {
    test(`${path} renders + no horizontal scroll`, async ({ page }) => {
      // Skip wallet connect on mobile — header CTAs may collapse into
      // a hamburger menu and block the trigger. Pages should render
      // their disconnected state without horizontal overflow regardless.
      await page.goto(path);

      // Layout mounts.
      const main = page.locator("main");
      await expect(main).toBeVisible();

      // No horizontal overflow on the body — common mobile regression.
      const overflowsX = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(overflowsX, `${path} has horizontal scroll on iPhone 14 width`).toBe(false);
    });
  }
});
