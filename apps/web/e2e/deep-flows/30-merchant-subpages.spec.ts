/**
 * Deep flow #30 — MERCHANT SUBPAGES (analytics, disputes, capabilities, verify)
 *
 * Proves: All merchant operator subpages render for the connected merchant.
 * Bob's wallet acts as the merchant. Each subpage hits its own API endpoint.
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, BOB_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

const SUBPAGES = [
  { path: "/m/me/analytics", name: "Analytics" },
  { path: "/m/me/disputes", name: "Disputes" },
  { path: "/m/me/capabilities", name: "Capabilities" },
  { path: "/m/me/verify", name: "DNS verify" },
  { path: "/m/me", name: "Public profile (own)" },
];

for (const { path, name } of SUBPAGES) {
  test(`DEEP-30 [${path}]: ${name} renders for Bob (merchant persona)`, async ({ browser }) => {
    test.setTimeout(120_000);
    const bobCtx = await openPersonaContext(browser, BOB_KEY);
    const page = await bobCtx.newPage();
    try {
      await connectBurner(page);
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await waitForW6Hydrated(page);
      await page.waitForTimeout(3_000);

      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 15_000 });
      const text = await main.textContent();
      expect(text?.trim().length ?? 0, `${path} has content`).toBeGreaterThan(20);
      expect(text).not.toMatch(/500.*internal|server error/i);

      console.log(`[DEEP-30 ${path}] content: ${text?.length} chars`);
    } finally {
      await bobCtx.close();
    }
  });
}
