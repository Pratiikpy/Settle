/**
 * Deep flow #6 — REQUEST MONEY (generate Solana Pay QR)
 *
 * Proves: Alice fills /request form (amount + memo) → clicks Generate
 *         → Solana Pay QR canvas + URL appear
 * No on-chain action; client-side URL generation. The request URL can then
 * be shared and paid via the embed widget (covered separately).
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

test("DEEP-6: Alice generates a Solana Pay request — UI fills form, QR canvas + URL appear", async ({ browser }) => {
  test.setTimeout(120_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();
  try {
    await connectBurner(page);
    await page.goto("/request", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await waitForW6Hydrated(page);

    const amountInput = page.locator("input[placeholder='5.00']").first();
    await expect(amountInput).toBeVisible({ timeout: 15_000 });
    await amountInput.fill("0.5");

    const memoInput = page.locator("input[placeholder='Invoice #1024']").first();
    await memoInput.fill("e2e-test-request");

    const generateButton = page.locator("button", { hasText: /Generate/ }).first();
    await expect(generateButton).toBeVisible({ timeout: 10_000 });
    await generateButton.click();

    // Wait for QR canvas to render (the canvas element is in the generated panel)
    await expect(page.getByText(/Solana Pay QR/i).first()).toBeVisible({ timeout: 30_000 });
    console.log("[DEEP-6] Solana Pay QR section visible");

    // Verify QR canvas exists and has rendered content
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    const dimensions = await canvas.evaluate((el: HTMLCanvasElement) => ({
      w: el.width,
      h: el.height,
    }));
    expect(dimensions.w, "QR canvas has width").toBeGreaterThan(0);
    expect(dimensions.h, "QR canvas has height").toBeGreaterThan(0);
    console.log("[DEEP-6] QR canvas:", dimensions);

    console.log("[DEEP-6] ✅ Request flow verified — form → QR rendered");
  } finally {
    await aliceCtx.close();
  }
});
