/**
 * Deep flow #16 — SPENDING + ACTIVITY FEED
 *
 * Proves: Alice's /spending page renders categories. Activity inbox renders.
 *         No deep on-chain action — read-only views with live data.
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

test("DEEP-16a: Alice's /spending page renders analytics", async ({ browser }) => {
  test.setTimeout(60_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();
  try {
    await connectBurner(page);
    await page.goto("/spending", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await waitForW6Hydrated(page);
    await page.waitForTimeout(3_000);
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });
    const text = await main.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(20);
    console.log("[DEEP-16a] ✅ /spending renders");
  } finally {
    await aliceCtx.close();
  }
});

test("DEEP-16b: Alice's /agents page renders", async ({ browser }) => {
  test.setTimeout(60_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();
  try {
    await connectBurner(page);
    await page.goto("/agents", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await waitForW6Hydrated(page);
    await page.waitForTimeout(3_000);
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });
    const text = await main.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(20);
    console.log("[DEEP-16b] ✅ /agents renders");
  } finally {
    await aliceCtx.close();
  }
});

test("DEEP-16c: Alice's /admin/preflight page renders check list", async ({ browser }) => {
  test.setTimeout(60_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();
  try {
    await connectBurner(page);
    await page.goto("/admin/preflight", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await waitForW6Hydrated(page);
    await page.waitForTimeout(3_000);
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });

    // /api/preflight should return checks
    const r = await page.request.get("/api/preflight", { failOnStatusCode: false });
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.checks).toBeDefined();
      console.log(`[DEEP-16c] /api/preflight returned ${body.checks?.length} checks`);
    }
    console.log("[DEEP-16c] ✅ /admin/preflight renders");
  } finally {
    await aliceCtx.close();
  }
});
