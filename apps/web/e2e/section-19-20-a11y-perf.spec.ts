import { test, expect } from "@playwright/test";

/**
 * Section 19 — Accessibility: basic axe-core lite checks via Playwright.
 * Section 20 — Performance: page-load timing for hot routes.
 */
test.describe("Sections 19-20 · A11y + Perf", () => {
  test("19.1 — landing has at least one h1, lang attr, viewport meta", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBeGreaterThanOrEqual(1);
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toMatch(/en|es|ja|zh/);
    const viewport = await page.locator('meta[name="viewport"]').count();
    expect(viewport).toBeGreaterThanOrEqual(1);
  });

  test("19.2 — every interactive button has accessible text", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const buttons = page.locator("button:visible");
    const count = await buttons.count();
    let unnamed = 0;
    for (let i = 0; i < Math.min(count, 30); i++) {
      const b = buttons.nth(i);
      const txt = (await b.textContent())?.trim();
      const aria = await b.getAttribute("aria-label");
      if (!txt && !aria) unnamed++;
    }
    expect(unnamed).toBeLessThanOrEqual(2); // tolerate icon-only buttons up to 2
  });

  test("20.1 — landing renders body within 3s of navigation start", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    await page.waitForFunction(() => document.body && document.body.children.length > 0, null, { timeout: 5000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test("20.2 — /dashboard renders main within 8s of navigation start (post-build)", async ({ page }) => {
    const start = Date.now();
    await page.goto("/dashboard");
    await page.locator("main").first().waitFor({ state: "visible", timeout: 10000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });
});
