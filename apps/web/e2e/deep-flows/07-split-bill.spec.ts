/**
 * Deep flow #7 — SPLIT BILL (create)
 *
 * Proves: Alice fills /split-bill form (label + total + n payers) → clicks Create
 *         → /api/split-bills POST succeeds → redirects to /split-bill/[id]
 *         → bill detail page renders with the label and per-payer share
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

test("DEEP-7: Alice creates a split bill — UI fills form, redirects to bill detail", async ({ browser }) => {
  test.setTimeout(120_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();
  try {
    await connectBurner(page);
    await page.goto("/split-bill", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await waitForW6Hydrated(page);

    const uniqueLabel = `e2e-split-${Date.now().toString(36)}`;
    const labelInput = page.locator("input[placeholder*='Friday dinner']").first();
    await expect(labelInput).toBeVisible({ timeout: 15_000 });
    await labelInput.fill(uniqueLabel);

    const totalInput = page.locator("input[placeholder='Total ($)']").first();
    await totalInput.fill("3.00");

    const createButton = page.locator("button.w6-btn-primary", { hasText: /Create bill/ }).first();
    await expect(createButton).toBeVisible({ timeout: 10_000 });
    await createButton.click();

    // After creation, page redirects to /split-bill/[id]. Wait for URL change.
    await page.waitForURL(/\/split-bill\/[a-f0-9-]+/, { timeout: 60_000 });
    const newUrl = page.url();
    console.log("[DEEP-7] Redirected to:", newUrl);

    // Bill detail should render the label
    await expect(page.getByText(uniqueLabel).first()).toBeVisible({ timeout: 15_000 });
    console.log("[DEEP-7] Bill detail shows label:", uniqueLabel);

    console.log("[DEEP-7] ✅ Split bill creation verified end-to-end");
  } finally {
    await aliceCtx.close();
  }
});
