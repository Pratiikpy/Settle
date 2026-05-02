import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * T4 — Visual regression baselines. Generates a screenshot per Phase 5
 * surface at three viewports. First run produces the baseline; subsequent
 * runs diff. Stored under apps/web/e2e/__screenshots__/.
 *
 * Connected (burner) only — disconnected baselines can be added later if
 * UX-divergent. We use the burner's stable wallet-modal-closed state for
 * deterministic comparison.
 */

const PHASE5_ROUTES = [
  "/dashboard",
  "/cards",
  "/wishes",
  "/allowances",
  "/groups",
  "/spending",
  "/feed",
  "/send",
  "/settings",
];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

test.describe("Visual regression baselines", () => {
  for (const vp of VIEWPORTS) {
    for (const path of PHASE5_ROUTES) {
      test(`${path} @ ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/");
        await connectBurner(page);
        await page.goto(path);
        await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
        // Settle dynamic regions (animations, real-time clocks)
        await page.waitForTimeout(1500);
        // Hide highly-dynamic elements that flap pixel-by-pixel
        await page.addStyleTag({
          content: `
            [data-dynamic],
            time,
            [data-pyth-price],
            .toast,
            [data-sonner-toast] {
              visibility: hidden !important;
            }
          `,
        });
        // Capture
        await expect(page).toHaveScreenshot(`${path.slice(1) || "home"}-${vp.name}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.05,
          animations: "disabled",
        });
      });
    }
  }
});
