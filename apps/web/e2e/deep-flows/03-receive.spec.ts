/**
 * Deep flow #3 — RECEIVE (copy address)
 *
 * Proves: /receive shows Alice's address, click "Copy address" → button flips to "Copied ✓"
 * No on-chain action needed; this is a UI utility flow.
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

const ALICE_PUB = "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY";

test("DEEP-3: Alice opens /receive, sees her address, copies it", async ({ browser }) => {
  test.setTimeout(60_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  // Grant clipboard read/write (default chromium behavior is restrictive)
  await aliceCtx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3000" });
  const page = await aliceCtx.newPage();
  try {
    await connectBurner(page);
    await page.goto("/receive");
    await waitForW6Hydrated(page);

    // Address should be visible on the page
    const addressVisible = await page.getByText(ALICE_PUB).first().isVisible({ timeout: 15_000 });
    expect(addressVisible, `Alice's address ${ALICE_PUB.slice(0,8)} on /receive`).toBeTruthy();
    console.log("[DEEP-3] Address visible:", ALICE_PUB.slice(0, 8));

    // Click "Copy address"
    const copyButton = page.locator("button.w6-btn-primary", { hasText: /Copy address/ }).first();
    await expect(copyButton).toBeVisible({ timeout: 10_000 });
    await copyButton.click();

    // Button should flip to "Copied ✓"
    await expect(
      page.locator("button.w6-btn-primary", { hasText: /Copied/ }).first(),
    ).toBeVisible({ timeout: 5_000 });
    console.log("[DEEP-3] Button shows 'Copied ✓'");

    // Verify clipboard actually contains the address
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip, "clipboard contains address").toBe(ALICE_PUB);
    console.log("[DEEP-3] ✅ Address copied to clipboard verified");
  } finally {
    await aliceCtx.close();
  }
});
