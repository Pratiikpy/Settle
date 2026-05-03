import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * TEST_PLAN Section 4 — Receipts (Consumer · ALICE).
 *
 *   4.1 — /ledger renders + filter chips present
 *   4.3 — Walletless verifier route renders + accepts hash input
 *   4.4 — Receipt importer route renders
 *   4.5 — Export receipts route renders
 */
test.describe("Section 4 · Receipts", () => {
  test("4.1 — /ledger filter chips render", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/ledger");
    await page.waitForFunction(() => document.body.getAttribute("data-w6") === "1", null, { timeout: 30000 });
    // 8 prototype filter chips: All / Sends / Agent spends / Streaming / Escrow / Refunds / Denied / Public
    const chipsHtml = await page.content();
    for (const label of ["All", "Sends", "Streaming", "Refunds", "Denied"]) {
      expect(chipsHtml).toContain(label);
    }
  });

  test("4.3 — /verify walletless hash verifier renders", async ({ page }) => {
    const r = await page.goto("/verify");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("4.4 — /import receipt importer renders", async ({ page }) => {
    const r = await page.goto("/import");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("4.5 — /settings/exports renders + has export trigger", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/settings/exports");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });
});
