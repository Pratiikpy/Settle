/**
 * Deep flow #29 — MISC ACTIONS
 *
 * Tests for less-common but real action flows:
 *   - /pay landing page (developer docs + widget)
 *   - /verify/[hash] dynamic verify
 *   - /admin/health
 *   - /admin/cron
 *   - /admin/federation/origins
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

test("DEEP-29a: /pay developer landing page renders", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("http://localhost:3000/pay", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(1_500);
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });
    const text = await main.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(50);
    console.log(`[DEEP-29a] /pay content: ${text?.length} chars`);
  } finally {
    await ctx.close();
  }
});

test("DEEP-29b: /verify/[hash] returns valid response (or not-found, never 500)", async ({ request }) => {
  const fakeHash = "deadbeef1234567890abcdef".repeat(3).slice(0, 64);
  const r = await request.get(`http://localhost:3000/verify/${fakeHash}`, { failOnStatusCode: false });
  expect(r.status()).not.toBe(500);
  console.log(`[DEEP-29b] /verify/[fake-hash] → ${r.status()}`);
});

test("DEEP-29c: /admin/health renders (if accessible)", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto("http://localhost:3000/admin/health", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    expect(r?.status() ?? 0).toBeLessThan(500);
    console.log(`[DEEP-29c] /admin/health → ${r?.status()}`);
  } finally {
    await ctx.close();
  }
});

test("DEEP-29d: /admin/cron renders (if accessible)", async ({ browser }) => {
  test.setTimeout(60_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();
  try {
    await connectBurner(page);
    const r = await page.goto("/admin/cron", { waitUntil: "domcontentloaded", timeout: 180_000 });
    expect(r?.status() ?? 0).toBeLessThan(500);
    await page.waitForTimeout(2_000);
    const text = await page.locator("body").textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(20);
    console.log(`[DEEP-29d] /admin/cron rendered`);
  } finally {
    await aliceCtx.close();
  }
});
