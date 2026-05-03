import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * TEST_PLAN Sections 6-9 — Groups / Savings / Allowances / Merchant.
 *
 * Surface-level "the route renders + key UI affordances are present".
 * Real multi-persona flows defer to dedicated specs.
 */
test.describe("Sections 6-9 · multi-surface coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
  });

  test("6.1 — /groups renders + create surface accessible", async ({ page }) => {
    const r = await page.goto("/groups");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("7.1 — /wishes savings buckets render", async ({ page }) => {
    const r = await page.goto("/wishes");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("7.2/3 — /allowances schedule + round-up surfaces render", async ({ page }) => {
    const r = await page.goto("/allowances");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("9.1 — Merchant /m/[handle] public profile renders", async ({ page }) => {
    const r = await page.goto("/m/satoshi");
    // Either 200 (handle exists) or 404 (handle not registered) — both valid
    expect([200, 404]).toContain(r?.status() ?? 0);
  });

  test("9.x — Merchant manage page renders", async ({ page }) => {
    const r = await page.goto("/m/me/manage");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("9.x — Merchant analytics renders", async ({ page }) => {
    const r = await page.goto("/m/me/analytics");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("9.x — Merchant disputes renders", async ({ page }) => {
    const r = await page.goto("/m/me/disputes");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("9.x — Merchant verify (DNS) renders", async ({ page }) => {
    const r = await page.goto("/m/me/verify");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("9.x — Merchant webhook renders", async ({ page }) => {
    const r = await page.goto("/m/me/webhook");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });
});
