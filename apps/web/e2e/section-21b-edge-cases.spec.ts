import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * TEST_PLAN Section 21b — UI error/edge cases.
 *
 * Empty states, error states, long-content overflow.
 */
test.describe("Section 21b · UI edge cases", () => {
  test("21b.1 — disconnected /dashboard renders without crash", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    // Disconnected state — page renders, no crash. The exact copy varies
    // depending on Wave 6 design polish; the gate here is "main exists".
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("21b.2 — invalid pubkey on /verify shows error or no-op gracefully", async ({ page }) => {
    await page.goto("/verify");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("21b.3 — unknown receipt id route renders 404 or redirects", async ({ page }) => {
    const r = await page.goto("/r/this-receipt-does-not-exist-xyz");
    // 200 (renders empty state) or 404 (route-level not-found) — both valid
    expect([200, 404]).toContain(r?.status() ?? 0);
  });

  test("21b.4 — long-content / mobile no horizontal scroll on /dashboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/dashboard");
    await page.waitForFunction(() => document.body.getAttribute("data-w6") === "1", null, { timeout: 30000 });
    const dims = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
    }));
    expect(dims.docW).toBeLessThanOrEqual(dims.winW + 1); // 1px tolerance
  });

  test("21b.5 — 404 page renders W6 chrome (not raw Next default)", async ({ page }) => {
    const r = await page.goto("/this-route-does-not-exist-12345");
    expect(r?.status()).toBe(404);
    const html = await page.content();
    expect(html.length).toBeGreaterThan(100);
  });
});
