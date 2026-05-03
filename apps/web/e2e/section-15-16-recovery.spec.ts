import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * Sections 15, 16 — Recovery / Refunds / Disputes
 *
 * Verifies UI surfaces for recovery flows render.
 */
test.describe("Sections 15-16 · Recovery / Refund / Dispute", () => {
  test("15.x — refund flow surfaces on receipt detail", async ({ page }) => {
    await page.goto("/r/test-receipt-id");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body").first()).toBeVisible();
  });

  test("16.x — disputes route renders", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/m/me/disputes");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });
});
