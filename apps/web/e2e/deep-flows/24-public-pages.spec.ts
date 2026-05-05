/**
 * Deep flow #24 — PUBLIC PAGES (no wallet required)
 *
 * Proves: Public-facing pages render correctly without a wallet connection.
 * Critical for SEO, sharing, and onboarding.
 */
import { test, expect } from "@playwright/test";

const ROUTES = [
  { path: "/", name: "Landing" },
  { path: "/brand", name: "Brand" },
  { path: "/security", name: "Security" },
  { path: "/privacy", name: "Privacy" },
  { path: "/docs", name: "Docs" },
  { path: "/public-goods", name: "Public Goods" },
  { path: "/changelog", name: "Changelog" },
  { path: "/help", name: "Help" },
];

for (const { path, name } of ROUTES) {
  test(`DEEP-24 [${path}]: ${name} renders publicly without wallet`, async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(`http://localhost:3000${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 180_000,
      });
      await page.waitForTimeout(1_500);

      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 15_000 });
      const text = await main.textContent();
      expect(text?.trim().length ?? 0, `${path} has content`).toBeGreaterThan(20);
      expect(text).not.toMatch(/500.*internal|server error/i);

      console.log(`[DEEP-24 ${path}] content: ${text?.length} chars`);
    } finally {
      await ctx.close();
    }
  });
}
