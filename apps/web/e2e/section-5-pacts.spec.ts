import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * TEST_PLAN Section 5 — Pacts (Consumer · ALICE).
 *
 *   5.1 — /cards renders with W6 layout, filter chips, mode explainers
 *   5.x — /cards/new opens a Pact creation surface (3 modes selectable)
 *   5.10/11 — /cards/[id] renders for a known pact
 */
test.describe("Section 5 · Pacts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
  });

  test("5.1 — /cards renders mode explainers + filter chips", async ({ page }) => {
    await page.goto("/cards");
    await page.waitForFunction(() => document.body.getAttribute("data-w6") === "1", null, { timeout: 30000 });
    const html = await page.content();
    // 3 mode explainers: OneShot / Streaming / Delivery escrow
    expect(html).toMatch(/OneShot/);
    expect(html).toMatch(/Streaming/);
    expect(html).toMatch(/Delivery/i);
    // 5 filter chips
    for (const label of ["All", "OneShot", "Streaming", "Escrow", "Closed"]) {
      expect(html).toContain(label);
    }
  });

  test("5.x — /cards/new renders create surface", async ({ page }) => {
    const r = await page.goto("/cards/new");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("5.10 — /cards/[id] route resolves for known pact", async ({ page }) => {
    // Use one of the seeded pacts on devnet
    const KNOWN_PACT = "9tqwgWNRjx5vVZSJFZS85BTawhQuhvFmAZQq1SEpo7aa";
    const r = await page.goto(`/cards/${KNOWN_PACT}`);
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });
});
