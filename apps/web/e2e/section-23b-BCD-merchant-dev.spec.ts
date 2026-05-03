import { test, expect, type Page } from "@playwright/test";
import { openPersonaContext, BOB_KEY, ALICE_KEY } from "./helpers/seed-burner";

async function connect(page: Page) {
  await page.goto("/?stay=1");
  await page.locator(".wallet-adapter-button-trigger").first().click();
  await page
    .locator(".wallet-adapter-modal-list li:has-text('E2E Persona')")
    .first()
    .click();
  await page
    .locator(".wallet-adapter-modal")
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * §23b.B + 23b.C + 23b.D — merchant + agent + developer matrix rows.
 */
test.describe("§23b.B+C+D · merchant/agent/dev matrix", () => {
  // ── 23b.B merchant ──
  for (const [id, path] of [
    ["B1", "/m/me/manage"],
    ["B4", "/m/me/analytics"],
    ["B7", "/m/me/verify"],
    ["B8", "/m/me/webhook"],
    ["B11", "/m/me/capabilities"],
    ["B12", "/m/me/disputes"],
  ] as const) {
    test(`23b.${id} — ${path} renders for merchant persona`, async ({ browser }) => {
      test.setTimeout(60_000);
      const ctx = await openPersonaContext(browser, BOB_KEY);
      try {
        const page = await ctx.newPage();
        await connect(page);
        const r = await page.goto(path);
        expect(r?.status()).toBeLessThan(400);
        await expect(page.locator("main").first()).toBeVisible();
      } finally {
        await ctx.close();
      }
    });
  }

  test("23b.B2 — Pay QR page renders for known merchant slug", async ({ page }) => {
    const r = await page.goto("/qr/Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB/test-slug");
    expect(r?.status()).toBe(200);
  });

  test("23b.B16 — public merchant profile route", async ({ page }) => {
    const r = await page.goto("/m/satoshi");
    expect([200, 404].includes(r?.status() ?? 0)).toBeTruthy();
  });

  // ── 23b.C agent ──
  for (const [id, path] of [
    ["C1", "/agents"],
    ["C3", "/agents/new"],
    ["C4", "/agents/streaming"],
    ["C9", "/audit"],
  ] as const) {
    test(`23b.${id} — ${path} renders for agent persona`, async ({ browser }) => {
      test.setTimeout(60_000);
      const ctx = await openPersonaContext(browser, ALICE_KEY);
      try {
        const page = await ctx.newPage();
        await connect(page);
        const r = await page.goto(path);
        expect(r?.status()).toBeLessThan(400);
      } finally {
        await ctx.close();
      }
    });
  }

  test("23b.C5 — Hire-Blink share link route", async ({ page }) => {
    const r = await page.goto("/blink/research");
    expect(r?.status()).toBe(200);
  });

  // ── 23b.D developer ──
  for (const [id, path] of [
    ["D1", "/docs"],
    ["D2", "/docs/mcp"],
    ["D5", "/docs/pay-component"],
    ["D6", "/docs/verify-component"],
    ["D7", "/docs/webhooks"],
    ["D8", "/sandbox"],
  ] as const) {
    test(`23b.${id} — ${path} dev surface renders`, async ({ page }) => {
      const r = await page.goto(path);
      expect(r?.status()).toBeLessThan(400);
    });
  }
});
