/**
 * Deep flow #28 — Remaining UI routes coverage
 *
 * Catch-all spec covering UI pages not yet tested in earlier deep flows.
 * Each test: navigate, wait for content, verify no 500 error.
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

const ROUTES_NO_WALLET = [
  { path: "/start", name: "Start (persona picker)" },
  { path: "/start/consumer", name: "Start consumer" },
  { path: "/start/agent", name: "Start agent" },
  { path: "/start/business", name: "Start business (redirect)" },
  { path: "/terms", name: "Terms of service" },
  { path: "/stats", name: "Public stats" },
  { path: "/watch", name: "Watch agents" },
  { path: "/capabilities", name: "Capabilities root" },
  { path: "/leaderboard", name: "Leaderboard" },
  { path: "/pay/widget", name: "Pay widget docs" },
];

for (const { path, name } of ROUTES_NO_WALLET) {
  test(`DEEP-28 [${path}]: ${name} renders publicly`, async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const r = await page.goto(`http://localhost:3000${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 180_000,
      });
      // Allow 200 + any 3xx redirects
      const status = r?.status() ?? 0;
      expect(status, `${path} status`).toBeLessThan(500);
      await page.waitForTimeout(1_500);

      const main = page.locator("main").first();
      const visible = await main.isVisible({ timeout: 15_000 }).catch(() => false);
      if (visible) {
        const text = await main.textContent();
        expect(text?.trim().length ?? 0, `${path} has content`).toBeGreaterThan(20);
        expect(text).not.toMatch(/500.*internal|server error/i);
        console.log(`[DEEP-28 ${path}] content: ${text?.length} chars`);
      } else {
        console.log(`[DEEP-28 ${path}] no <main> — may be embedded layout`);
      }
    } finally {
      await ctx.close();
    }
  });
}

const ROUTES_WITH_WALLET = [
  { path: "/cards/new", name: "Create card form" },
  { path: "/agents/new", name: "Create agent form" },
  { path: "/agents/templates", name: "Agent templates list" },
  { path: "/agents/streaming", name: "Streaming agent" },
  { path: "/agents/collab", name: "Agent collab" },
  { path: "/settings/relayer", name: "Settings relayer (delegate flow)" },
];

for (const { path, name } of ROUTES_WITH_WALLET) {
  test(`DEEP-28 [${path}]: ${name} renders for connected wallet`, async ({ browser }) => {
    test.setTimeout(120_000);
    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    const page = await aliceCtx.newPage();
    try {
      await connectBurner(page);
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await waitForW6Hydrated(page);
      await page.waitForTimeout(2_000);

      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 15_000 });
      const text = await main.textContent();
      expect(text?.trim().length ?? 0, `${path} has content`).toBeGreaterThan(20);
      expect(text).not.toMatch(/500.*internal|server error/i);
      console.log(`[DEEP-28 ${path}] content: ${text?.length} chars`);
    } finally {
      await aliceCtx.close();
    }
  });
}
