/**
 * Deep flow #31 — DETAIL PAGES (receipts, profile, QR landing)
 *
 * Tests dynamic-route detail pages that surface single records:
 *   - /at/[handle] — public user profile
 *   - /qr/[merchant]/[slug] — Solana Pay QR landing
 *   - /verify-build — build provenance page
 */
import { test, expect } from "@playwright/test";

const ALICE_PUB = "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY";
const BOB_PUB = "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";

test("DEEP-31a: /at/[handle] profile page renders (with pubkey as handle)", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto(`http://localhost:3000/at/${ALICE_PUB}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    expect(r?.status() ?? 0, "/at/[pubkey] status").toBeLessThan(500);
    await page.waitForTimeout(2_000);
    const text = await page.locator("body").textContent();
    expect(text?.trim().length ?? 0, "profile has content").toBeGreaterThan(20);
    console.log(`[DEEP-31a] /at/${ALICE_PUB.slice(0, 8)}... rendered`);
  } finally {
    await ctx.close();
  }
});

test("DEEP-31b: /qr/[merchant]/[slug] Solana Pay QR landing renders", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto(`http://localhost:3000/qr/${BOB_PUB}/coffee`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    expect(r?.status() ?? 0, "/qr/[merchant]/[slug] status").toBeLessThan(500);
    await page.waitForTimeout(2_000);
    const text = await page.locator("body").textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(20);
    console.log(`[DEEP-31b] QR landing rendered for ${BOB_PUB.slice(0, 8)}.../coffee`);
  } finally {
    await ctx.close();
  }
});

test("DEEP-31c: /verify-build provenance page renders", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto("http://localhost:3000/verify-build", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    expect(r?.status() ?? 0).toBeLessThan(500);
    await page.waitForTimeout(1_500);
    const main = page.locator("main").first();
    if (await main.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const text = await main.textContent();
      expect(text?.trim().length ?? 0).toBeGreaterThan(20);
    }
    console.log("[DEEP-31c] /verify-build rendered");
  } finally {
    await ctx.close();
  }
});

test("DEEP-31d: /docs/pay-component renders", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("http://localhost:3000/docs/pay-component", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await page.waitForTimeout(1_500);
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });
    const text = await main.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(50);
    console.log(`[DEEP-31d] /docs/pay-component: ${text?.length} chars`);
  } finally {
    await ctx.close();
  }
});

test("DEEP-31e: /docs/verify-component renders", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("http://localhost:3000/docs/verify-component", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await page.waitForTimeout(1_500);
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });
    const text = await main.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(50);
    console.log(`[DEEP-31e] /docs/verify-component: ${text?.length} chars`);
  } finally {
    await ctx.close();
  }
});

test("DEEP-31f: /docs/webhooks renders", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("http://localhost:3000/docs/webhooks", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await page.waitForTimeout(1_500);
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });
    const text = await main.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(50);
    console.log(`[DEEP-31f] /docs/webhooks: ${text?.length} chars`);
  } finally {
    await ctx.close();
  }
});

test("DEEP-31g: /docs/mcp renders", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("http://localhost:3000/docs/mcp", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await page.waitForTimeout(1_500);
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });
    const text = await main.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(50);
    console.log(`[DEEP-31g] /docs/mcp: ${text?.length} chars`);
  } finally {
    await ctx.close();
  }
});
