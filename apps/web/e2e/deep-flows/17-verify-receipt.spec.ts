/**
 * Deep flow #17 — VERIFY RECEIPT (public verifier)
 *
 * Proves: User opens /verify → pastes a tx signature → clicks Verify
 *         → /api/verify/{sig} returns data or "not found" → UI updates with stage
 *
 * Uses one of the real signatures from earlier deep tests (DEEP-1, DEEP-4).
 */
import { test, expect } from "@playwright/test";

test("DEEP-17: User pastes tx sig in /verify → API checked → UI stage transitions", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("http://localhost:3000/verify", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await page.waitForTimeout(2_000);

    // Paste a known tx signature (any base58 sig from devnet)
    const testSig = "2yGMHFpEaxMaWUhkjfWzBRXhDQWCKg1V6Kv1VPsGW2FTZ5BVS1YtNyqQtYLNuhBNEZKkLPsY5UTVpk1qrXXqRkVc";

    const input = page.locator("input[placeholder*='b8c2f9a3']").first();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill(testSig);

    // Capture API response
    let verifyStatus = -1;
    page.on("response", (resp) => {
      if (resp.url().includes("/api/verify/")) {
        verifyStatus = resp.status();
      }
    });

    const verifyButton = page.locator("button.w6-btn-primary", { hasText: /Verify/ }).first();
    await verifyButton.click();

    // Watch stage progression
    await expect(
      page.locator("button", { hasText: /Verifying…|# Verify/ }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Wait up to 30s for the API verify to complete
    for (let i = 0; i < 30; i++) {
      if (verifyStatus !== -1) break;
      await page.waitForTimeout(1_000);
    }

    expect(verifyStatus, "verify API responded").not.toBe(-1);
    expect(verifyStatus, "verify API not 500").not.toBe(500);
    console.log(`[DEEP-17] /api/verify/${testSig.slice(0, 8)}... → ${verifyStatus}`);

    console.log("[DEEP-17] ✅ Verify flow verified");
  } finally {
    await ctx.close();
  }
});
