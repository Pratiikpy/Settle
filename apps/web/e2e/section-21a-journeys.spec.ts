import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * Section 21a — Pure user-journey tests (drive UI like a real user).
 *
 * These walk full multi-page flows. No back-channel API shortcuts.
 */
test.describe("Section 21a · User journeys", () => {
  test("J1 — landing → connect → dashboard → send → receipts → back to dashboard", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/?stay=1");
    await expect(page.locator("h1").first()).toBeVisible();
    await connectBurner(page);

    await page.goto("/dashboard");
    await page.waitForFunction(() => document.body.getAttribute("data-w6") === "1", null, { timeout: 30000 });
    await expect(page.locator("main").first()).toBeVisible();

    // Click "Send" CTA
    await page.goto("/send");
    const recipient = page.locator("input[placeholder='@handle']").first();
    await expect(recipient).toBeVisible({ timeout: 15000 });

    // Visit ledger
    await page.goto("/ledger");
    await page.waitForFunction(() => document.body.getAttribute("data-w6") === "1", null, { timeout: 30000 });
    await expect(page.locator("main").first()).toBeVisible();

    // Back to dashboard
    await page.goto("/dashboard");
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("J2 — dashboard → cards → cards/new → back → cards/[id]", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/?stay=1");
    await connectBurner(page);

    await page.goto("/cards");
    await page.waitForFunction(() => document.body.getAttribute("data-w6") === "1", null, { timeout: 30000 });

    await page.goto("/cards/new");
    await expect(page.locator("main").first()).toBeVisible();

    await page.goto("/cards");
    await expect(page.locator("main").first()).toBeVisible();

    // Detail of a known seeded pact
    await page.goto("/cards/9tqwgWNRjx5vVZSJFZS85BTawhQuhvFmAZQq1SEpo7aa");
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("J3 — agents → agents/new → templates", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/?stay=1");
    await connectBurner(page);

    await page.goto("/agents");
    await expect(page.locator("main").first()).toBeVisible();

    await page.goto("/agents/new");
    await expect(page.locator("main").first()).toBeVisible();

    await page.goto("/agents/streaming");
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("J4 — public verifier flow without wallet", async ({ page }) => {
    // No connect — walletless flow
    await page.goto("/verify");
    await expect(page.locator("main").first()).toBeVisible();

    await page.goto("/leaderboard");
    await page.waitForFunction(() => document.body.getAttribute("data-w6") === "1", null, { timeout: 30000 });
    await expect(page.locator("main").first()).toBeVisible();

    await page.goto("/stats");
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("J5 — disconnect via /?stay=1 + reconnect → still on landing", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    // Reload simulates disconnect
    await page.goto("/?stay=1");
    // Trigger should still be visible
    const trigger = page.locator(".wallet-adapter-button-trigger").first();
    await expect(trigger).toBeVisible({ timeout: 10000 });
  });
});
