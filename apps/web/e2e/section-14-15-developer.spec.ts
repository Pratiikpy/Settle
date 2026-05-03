import { test, expect } from "@playwright/test";

/**
 * Section 14 — Developer surface routes (UI side).
 * SDK/MCP package install tests live in scripts/.
 */
test.describe("Section 14 · Developer surface", () => {
  for (const path of [
    "/docs",
    "/docs/mcp",
    "/docs/pay-component",
    "/docs/verify-component",
    "/docs/webhooks",
    "/sandbox",
  ]) {
    test(`docs route ${path} renders`, async ({ page }) => {
      const r = await page.goto(path);
      expect(r?.status()).toBeLessThan(400);
      await expect(page.locator("main").first()).toBeVisible();
    });
  }
});
