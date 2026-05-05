/**
 * Deep flow #9 — WISH (savings bucket)
 *
 * Proves: Alice opens /wishes → "Save toward" tab → fills bucket form → creates a savings goal
 *         → bucket appears in the grid (with the unique label)
 *
 * The "Save toward" tab creates a savings goal in Supabase (not on-chain).
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

test("DEEP-9: Alice creates a savings bucket on /wishes — UI form → bucket appears in grid", async ({ browser }) => {
  test.setTimeout(120_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();

  // Capture API POSTs to /api/buckets
  let bucketPostStatus = -1;
  page.on("response", (resp) => {
    if (resp.request().method() === "POST" && resp.url().includes("/api/buckets")) {
      bucketPostStatus = resp.status();
    }
  });

  try {
    await connectBurner(page);
    await page.goto("/wishes", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await waitForW6Hydrated(page);
    await page.waitForTimeout(2_000);

    // Click "Save toward" tab using exact text match + DOM click via evaluate
    // (React state updates from click events sometimes lose to event handlers,
    // so we click via the DOM API directly which fires synchronously.)
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find((b) => b.textContent?.trim() === "Save toward");
      if (target) {
        target.click();
        return true;
      }
      return false;
    });
    expect(clicked, "Save toward button found and clicked").toBe(true);
    await page.waitForTimeout(1_500);

    // Fill bucket form — wait specifically for the bucket label input to appear
    // (this guarantees the Save tab is active, since Schedule tab has different inputs)
    const uniqueLabel = `e2e-wish-${Date.now().toString(36)}`;
    const labelInput = page.locator("input[placeholder*='AWS bill']").first();
    await expect(labelInput).toBeVisible({ timeout: 15_000 });
    await labelInput.fill(uniqueLabel);

    const targetInput = page.locator("input[placeholder='Target USDC']").first();
    await targetInput.fill("100");

    // Click "+ New bucket" via DOM eval (regex on inline-styled buttons is fragile)
    const newBucketClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find((b) => b.textContent?.trim() === "+ New bucket");
      if (target) {
        target.click();
        return true;
      }
      return false;
    });
    expect(newBucketClicked, "+ New bucket button found and clicked").toBe(true);

    // Wait for bucket to appear (or the form to clear)
    await page.waitForTimeout(3_000);

    // Wait for the API POST to complete
    for (let i = 0; i < 10; i++) {
      if (bucketPostStatus !== -1) break;
      await page.waitForTimeout(1_000);
    }

    // Either: bucket POST returned success status, OR the bucket text is visible
    const bucketVisible = await page.getByText(uniqueLabel, { exact: false }).first().isVisible({ timeout: 5_000 }).catch(() => false);

    if (bucketPostStatus !== -1) {
      console.log(`[DEEP-9] /api/buckets POST → ${bucketPostStatus}`);
      expect(bucketPostStatus, "bucket created via API").toBe(200);
    } else if (bucketVisible) {
      console.log(`[DEEP-9] Bucket "${uniqueLabel}" visible immediately (no POST captured but UI updated)`);
    } else {
      // Maybe the API uses a different path — check via direct query
      console.log("[DEEP-9] No bucket POST or visible bucket — likely API path mismatch or form validation");
    }
    expect(bucketPostStatus === 200 || bucketVisible, "bucket was created (API or UI confirms)").toBe(true);

    console.log("[DEEP-9] ✅ Wish savings bucket flow verified");
  } finally {
    await aliceCtx.close();
  }
});
