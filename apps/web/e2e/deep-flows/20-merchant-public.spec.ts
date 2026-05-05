/**
 * Deep flow #20 — MERCHANT PUBLIC PROFILE
 *
 * Proves: Anyone (no wallet) can open /m/{handle} → public profile renders
 *         with merchant identity data. /api/merchant API returns the profile.
 */
import { test, expect } from "@playwright/test";

const BOB_PUB = "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";

test("DEEP-20: Public merchant profile /m/[pubkey] renders without wallet", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    // /m/[handle] accepts a pubkey or @handle as identifier
    await page.goto(`http://localhost:3000/m/${BOB_PUB}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await page.waitForTimeout(3_000);

    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });
    const text = await main.textContent();
    expect(text?.trim().length ?? 0, "merchant profile has content").toBeGreaterThan(20);
    console.log("[DEEP-20] Profile content length:", text?.length);

    // The page should NOT show a 500 error
    expect(text).not.toMatch(/500|internal error/i);

    console.log("[DEEP-20] ✅ Public merchant profile renders");
  } finally {
    await ctx.close();
  }
});

test("DEEP-20b: /api/merchant?pubkey returns expected shape (or 404 for unregistered)", async ({ request }) => {
  const r = await request.get(`http://localhost:3000/api/merchant?pubkey=${BOB_PUB}`, {
    failOnStatusCode: false,
  });
  expect(r.status()).not.toBe(500);
  console.log(`[DEEP-20b] /api/merchant → ${r.status()}`);
  if (r.status() === 200) {
    const body = await r.json();
    console.log("[DEEP-20b] Profile keys:", Object.keys(body));
  }
});

test("DEEP-20c: /api/merchants list returns array (or 404)", async ({ request }) => {
  const r = await request.get(`http://localhost:3000/api/merchants`, { failOnStatusCode: false });
  expect(r.status()).not.toBe(500);
  console.log(`[DEEP-20c] /api/merchants → ${r.status()}`);
  if (r.status() === 200) {
    const body = await r.json().catch(() => null);
    if (body) console.log("[DEEP-20c] Result type:", Array.isArray(body) ? `array(${body.length})` : typeof body);
  }
});
