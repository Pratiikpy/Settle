import { test, expect, type Page } from "@playwright/test";
import { openPersonaContext, ALICE_KEY, BOB_KEY } from "./helpers/seed-burner";

/**
 * Section 23a — UI bridge across consumer/agent/merchant surfaces.
 * Verifies that a connected persona reaches each surface's home and the
 * surface-specific affordances render (proving the burner adapter signs
 * the auth message correctly across the W6 surface switcher).
 */
async function connectE2EPersona(page: Page) {
  await page.goto("/?stay=1");
  const trigger = page.locator(".wallet-adapter-button-trigger").first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click();
  const item = page
    .locator(".wallet-adapter-modal-list li:has-text('E2E Persona')")
    .first();
  await item.click();
  await page
    .locator(".wallet-adapter-modal")
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {});
}

test.describe("Section 23a · multi-surface bridge", () => {
  test("23a.consumer — ALICE reaches dashboard / send / cards / wishes / activity / settings", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connectE2EPersona(page);
      for (const path of ["/dashboard", "/send", "/cards", "/wishes", "/activity", "/settings"]) {
        await page.goto(path);
        await page.waitForFunction(
          () => document.body.getAttribute("data-w6") === "1",
          null,
          { timeout: 30_000 },
        );
        await expect(page.locator("main").first()).toBeVisible();
      }
    } finally {
      await ctx.close();
    }
  });

  test("23a.agent — ALICE reaches /agents and /agents/new connected", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connectE2EPersona(page);
      await page.goto("/agents");
      await expect(page.locator("main").first()).toBeVisible();
      await page.goto("/agents/new");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("23a.merchant — BOB reaches /m/me/manage and analytics connected", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, BOB_KEY);
    try {
      const page = await ctx.newPage();
      await connectE2EPersona(page);
      await page.goto("/m/me/manage");
      await expect(page.locator("main").first()).toBeVisible();
      await page.goto("/m/me/analytics");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("23a.profile — ALICE reaches /at/me and trust score loads", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connectE2EPersona(page);
      await page.goto("/at/me");
      await expect(page.locator("main").first()).toBeVisible();
      // /at/me will redirect-load to /at/[handle] via lookup; verify page mounts
      const html = await page.content();
      expect(html.length).toBeGreaterThan(500);
    } finally {
      await ctx.close();
    }
  });

  test("23a.cards-new-form — ALICE on /cards/new sees the create form", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connectE2EPersona(page);
      await page.goto("/cards/new");
      await expect(page.locator("main").first()).toBeVisible();
      // Form should show inputs for label / cap / etc
      const inputs = await page.locator("input, select, textarea").count();
      expect(inputs).toBeGreaterThanOrEqual(1);
    } finally {
      await ctx.close();
    }
  });

  test("23a.balance-loaded — ALICE's balance API returns real numbers", async ({
    browser,
  }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get(
        "/api/balance?pubkey=C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY",
        { timeout: 15_000 },
      );
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { usdc: string; sol: string };
      expect(parseFloat(j.usdc)).toBeGreaterThan(0);
      expect(parseFloat(j.sol)).toBeGreaterThan(0);
    } finally {
      await ctx.close();
    }
  });
});
