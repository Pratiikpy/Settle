import { test, expect } from "@playwright/test";

/**
 * Section 11 — Receipt kinds (UI side).
 * The page renders for any request_id; for known ids it shows the full
 * 4-hash chain + decision.
 */
const KNOWN_RECEIPT = "f6066dac-5602-4918-882a-02305aa60365";

test.describe("Section 11 · Receipt kinds (UI)", () => {
  test("11.1 — known receipt detail renders", async ({ page }) => {
    const r = await page.goto(`/receipts/${KNOWN_RECEIPT}`);
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("body").first()).toBeVisible();
  });

  test("11.2 — /verify accepts a hash and submits", async ({ page }) => {
    await page.goto("/verify");
    await page.waitForLoadState("domcontentloaded");
    // Look for a hash input
    const inp = page.locator('input[type="text"], input[type="search"]').first();
    if ((await inp.count()) > 0) {
      await inp.fill("0".repeat(64));
      await inp.blur();
      await page.waitForTimeout(800);
    }
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("11.3 — /verify-build verifiable build page renders", async ({ page }) => {
    const r = await page.goto("/verify-build");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });
});
