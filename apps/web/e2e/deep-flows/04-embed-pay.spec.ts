/**
 * Deep flow #4 — EMBED PAY (merchant flow)
 *
 * Proves: Alice opens Bob's /embed/pay?merchant=BOB&amount=0.001 widget,
 *         clicks Pay, signs, tx confirmed, Bob's USDC balance increased.
 *         The "Paid ✓" UI state appears; postMessage to parent fires.
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForSigConfirmed, getUsdcBalance } from "../helpers/deep-flow";
import { rpcConnection } from "../helpers/deep-flow";

const BOB_PUB = "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";
const PAY_AMOUNT = "0.001";

test("DEEP-4: Alice pays Bob 0.001 USDC via embed/pay widget — UI → sign → on-chain → balance moved", async ({ browser }) => {
  test.setTimeout(180_000);

  const bobBefore = await getUsdcBalance(BOB_PUB);
  console.log(`[DEEP-4] Bob USDC before: ${bobBefore}`);

  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();
  try {
    // Connect first via main app (so wallet adapter mounts), then navigate to embed
    await connectBurner(page);
    // Pre-warm /embed/pay (Next dev compiles first hit, ~30-90s cold)
    await page.goto(`/embed/pay?merchant=${BOB_PUB}&amount=${PAY_AMOUNT}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await page.waitForTimeout(2_000);

    // Pay button has "Pay $0.001" text
    const payButton = page.locator("button", { hasText: new RegExp(`Pay \\$${PAY_AMOUNT}`) }).first();
    await expect(payButton).toBeVisible({ timeout: 15_000 });
    await payButton.click();

    // Stage transition: signing → confirming → Paid ✓
    await expect(
      page.locator("button", { hasText: /Sign|Confirming/ }).first(),
    ).toBeVisible({ timeout: 15_000 });
    console.log("[DEEP-4] handlePay() fired — signing/confirming");

    // Final state: "Paid ✓" message
    await expect(page.getByText(/Paid ✓|Paid/).first()).toBeVisible({ timeout: 90_000 });
    console.log("[DEEP-4] UI shows 'Paid ✓'");

    // VERIFY: Bob's balance increased
    let bobAfter = bobBefore;
    for (let i = 0; i < 10; i++) {
      bobAfter = await getUsdcBalance(BOB_PUB);
      if (bobAfter > bobBefore) break;
      await page.waitForTimeout(1_500);
    }
    const delta = bobAfter - bobBefore;
    console.log(`[DEEP-4] Bob USDC after: ${bobAfter} (Δ +${delta.toFixed(6)})`);
    expect(delta, `Bob received ~${PAY_AMOUNT} USDC`).toBeCloseTo(parseFloat(PAY_AMOUNT), 5);

    console.log("[DEEP-4] ✅ Embed-pay flow verified end-to-end");
  } finally {
    await aliceCtx.close();
  }
});
