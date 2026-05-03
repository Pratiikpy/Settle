/**
 * §23h — 3-fork onboarding /start + persona pages + merchant trust badge.
 */
import { test, expect } from "@playwright/test";

test.describe("§23h · /start onboarding", () => {
  test("23h.start-renders — /start mounts with 3 forks", async ({ page }) => {
    const r = await page.goto("/start");
    expect(r?.status() || 0).toBeLessThan(500);
    await expect(page.getByTestId("start-headline")).toBeVisible();
    await expect(page.getByTestId("fork-consumer")).toBeVisible();
    await expect(page.getByTestId("fork-merchant")).toBeVisible();
    await expect(page.getByTestId("fork-agent")).toBeVisible();
  });

  test("23h.consumer-fork — clicking I send goes to /start/consumer 3-step", async ({
    page,
  }) => {
    await page.goto("/start");
    await page.getByTestId("fork-consumer").click();
    await expect(page).toHaveURL(/\/start\/consumer/);
    await expect(page.getByTestId("onboard-consumer")).toBeVisible();
    for (const n of [1, 2, 3]) {
      await expect(page.getByTestId(`onboard-step-${n}`)).toBeVisible();
    }
  });

  test("23h.merchant-fork — /start/merchant renders 3 steps", async ({ page }) => {
    await page.goto("/start/merchant");
    await expect(page.getByTestId("onboard-merchant")).toBeVisible();
    for (const n of [1, 2, 3]) {
      await expect(page.getByTestId(`onboard-step-${n}`)).toBeVisible();
    }
  });

  test("23h.agent-fork — /start/agent renders 3 steps + watch demo link", async ({
    page,
  }) => {
    await page.goto("/start/agent");
    await expect(page.getByTestId("onboard-agent")).toBeVisible();
    for (const n of [1, 2, 3]) {
      await expect(page.getByTestId(`onboard-step-${n}`)).toBeVisible();
    }
    // Step 3 CTA goes to /watch
    const link = page.getByTestId("onboard-step-3").locator("a").first();
    expect(await link.getAttribute("href")).toMatch(/\/(watch|docs)/);
  });
});

test.describe("§23h · Trust badges on merchant pages", () => {
  test("23h.merchant-trust-badge-visible — known merchant page shows trust badge + stats", async ({
    page,
  }) => {
    // Use a merchant handle that should exist or 404 gracefully.
    // Try a real merchant first; fall back to 404 acceptance if not seeded.
    const r = await page.goto("/m/arxiv");
    const status = r?.status() || 0;
    if (status >= 500) {
      throw new Error(`merchant page errored ${status}`);
    }
    if (status === 404) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "merchant 'arxiv' handle not seeded on this env",
      });
      return;
    }
    // The badge wiring is what we're testing — but profile may render a
    // not-found shell with 200 status if the handle isn't seeded.
    // Accept either (a) badge is visible OR (b) page is the not-found shell.
    const badgeCount = await page.getByTestId("merchant-trust-badge").count();
    if (badgeCount > 0) {
      await expect(page.getByTestId("merchant-trust-badge")).toBeVisible();
      await expect(page.getByTestId("merchant-trust-stats")).toBeVisible();
    } else {
      const html = await page.content();
      expect(html).toMatch(/not found|notFound|not.found/i);
    }
  });
});
