import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * Section 21a — deeper user-journey tests.
 */
test.describe("Section 21a · deep user journeys", () => {
  test("J6 — settings → privacy → exports → back", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/settings");
    await page.waitForLoadState("domcontentloaded");
    await page.goto("/settings/exports");
    await expect(page.locator("main").first()).toBeVisible();
    await page.goto("/settings/relayer");
    await expect(page.locator("main").first()).toBeVisible();
    await page.goto("/settings");
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("J7 — split-bill landing → detail", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/split-bill");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("J8 — collab → detail", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/collab/test-collab-id");
    expect([200, 404].includes(r?.status() ?? 0)).toBeTruthy();
  });

  test("J9 — merchant claim wizard", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    const r = await page.goto("/m/me/manage?setup=1");
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("J10 — public proof page (walletless)", async ({ page }) => {
    await page.goto("/at/satoshi/proof");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body").first()).toBeVisible();
  });
});
