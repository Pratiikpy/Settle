import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * TEST_PLAN Sections 10-13 — Agent / Receipts kinds / Notifications / Federation.
 */
test.describe("Sections 10-13 · agent + federation + public", () => {
  test("10.1 — /agents overview renders", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/agents");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("10.x — /agents/new (hire wizard) renders", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/agents/new");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("10.x — /agents/streaming renders", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/agents/streaming");
    expect(r?.status()).toBeLessThan(400);
  });

  test("10.x — /agents/templates renders", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/agents/templates");
    // Some surfaces require a real handle; 200 or 404 is acceptable
    expect([200, 404]).toContain(r?.status() ?? 0);
  });

  test("10.3 — /blink/[slug] dynamic route resolves any slug", async ({ page }) => {
    const r = await page.goto("/blink/research");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("12.1 — /activity (notifications) renders", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/activity");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("13 — /leaderboard federation panel + heatmap render", async ({ page }) => {
    const r = await page.goto("/leaderboard");
    expect(r?.status()).toBeLessThan(400);
    await page.waitForFunction(() => document.body.getAttribute("data-w6") === "1", null, { timeout: 30000 });
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("13 — /capabilities discovery renders", async ({ page }) => {
    const r = await page.goto("/capabilities");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("13 — /stats network counters render", async ({ page }) => {
    const r = await page.goto("/stats");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });
});
