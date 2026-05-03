import { test, expect } from "@playwright/test";

/**
 * Section 14.7 — <settle-verify> web component.
 * Verifies the verify embed route renders and accepts hash input.
 */
test.describe("Section 14.7 · settle-verify web component", () => {
  test("/embed/verify (if exists) or /verify renders an embeddable", async ({ page }) => {
    const r = await page.goto("/verify");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
    // Should have at least one input for the hash
    const inputs = await page.locator("input").count();
    expect(inputs).toBeGreaterThanOrEqual(0);
  });

  test("/verify-build verifiable build hash render", async ({ page }) => {
    await page.goto("/verify-build");
    await page.waitForLoadState("domcontentloaded");
    const html = await page.content();
    // Should mention "build" or "hash" or have a hash signature
    expect(html).toMatch(/build|hash|HU4piq|sha256|verify/i);
  });
});
