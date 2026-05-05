/**
 * demo-recorder.spec.ts — Hackathon demo recorder
 *
 * Long-cut Playwright spec that drives the production-only proof tour.
 * Total runtime ~2:20. No wallet required, no preview branch URL on
 * screen. The address bar always reads use-settle.vercel.app.
 *
 * Run:
 *   pnpm exec playwright test e2e/demo-recorder.spec.ts \
 *     --project=chromium-demo \
 *     --headed
 *
 * Output: apps/web/demo-recordings/<run-id>/video.webm
 *
 * SHOTS NOT IN THIS RECORDING (manual capture required by user):
 *   - Cross-language SDK terminal (TS/Python/Rust producing same hash)
 *   - Connected dashboard with real agent rows + receipts
 *   - Hire flow click-through (template → budget → 1 tx)
 *   - Streaming pact pause/resume (real wallet sig)
 *   - Cross-chain Ika tx (Solana policy → Ethereum execution)
 *
 * Stitch those manually with the production-tour video and add
 * voiceover. See PRE_DEMO_FIX_AND_GO_NO_GO.md for the full shot list.
 */

import { test, expect, type Page } from "@playwright/test";

const PROD = "https://use-settle.vercel.app";
const BOB = "DvzeYj2gE4Lu1uK8CDrkERWnBMXp5tGT2yVvc8KmUbAk";
const PROVEN_HASH =
  "ca50ca04e587acecbfefdab0bfdcee5351a521f33797d201417a9c3a238cc902";
const PROVEN_REQUEST_ID = "93de12a1-01c1-4fc8-83c0-1bff28f5a870";

async function frame(page: Page, ms: number) {
  await page.waitForTimeout(ms);
}

async function smoothScroll(page: Page, totalPx: number, durationMs: number) {
  // Scroll by `totalPx` over `durationMs` so the recording captures a
  // fluid pan instead of a jump cut. ~16 ms per step ≈ 60 FPS.
  const steps = Math.max(1, Math.round(durationMs / 16));
  const stepPx = totalPx / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((dy) => window.scrollBy(0, dy), stepPx);
    await page.waitForTimeout(16);
  }
}

test.describe("Hackathon demo recording", () => {
  // Long cut runs ~2:30; default 180s test timeout is too tight.
  test.setTimeout(360_000);

  test("production-only proof tour (long cut)", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: {
        dir: "demo-recordings",
        size: { width: 1280, height: 800 },
      },
    });
    const page = await ctx.newPage();

    // ═══════════════════════════════════════════════════════════════
    // SHOT 1 — Landing with live ticker (~6s)
    // "Settle. Verifiable money on Solana."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=settle://live").first()).toBeVisible({
      timeout: 15_000,
    });
    await frame(page, 5_000);
    // Smooth pan down so the ticker AND the bento grid both register.
    await smoothScroll(page, 350, 1_500);
    await frame(page, 1_500);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 2 — Verify with the proven hash (~12s)
    // "Paste a hash. Four BLAKE3 hashes match. No servers."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/verify?h=${PROVEN_HASH}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("VERIFIED").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("All 4 hashes match the canonical JSON.").first(),
    ).toBeVisible();
    await frame(page, 4_000);
    // Pan down to the four-hash table so the camera captures the match.
    await smoothScroll(page, 280, 1_500);
    await frame(page, 6_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 3 — Receipt detail (~10s)
    // "Real payment. $0.001 USDC. Solscan one click away."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/r/${PROVEN_REQUEST_ID}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Verified").first()).toBeVisible({
      timeout: 15_000,
    });
    await frame(page, 4_000);
    await smoothScroll(page, 320, 1_500);
    await frame(page, 4_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 4 — Live network stats (~10s)
    // "Real on-chain numbers."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/stats`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("RECEIPTS · 24H").first()).toBeVisible({
      timeout: 15_000,
    });
    // Wait for the count-up animation to settle.
    await frame(page, 6_000);
    await smoothScroll(page, 200, 1_200);
    await frame(page, 2_500);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 5 — Capability registry (~8s)
    // "Anyone can register a service. Capability hashes are unforgeable."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/capabilities`);
    await page.waitForLoadState("networkidle");
    await frame(page, 5_000);
    await smoothScroll(page, 280, 1_500);
    await frame(page, 2_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 6 — Capability heatmap + federation (~10s)
    // "Live capability market. Federation between merchants."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/leaderboard`);
    await page.waitForLoadState("networkidle");
    await frame(page, 4_000);
    await smoothScroll(page, 400, 2_000);
    await frame(page, 4_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 7 — Agent templates (~10s)
    // "Three pre-built agents. Pick a budget, hire in one tx."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/agents/templates`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Pre-built agent configurations.").first()).toBeVisible({
      timeout: 15_000,
    });
    await frame(page, 6_000);
    // Hover the first template to show interactivity.
    await page.getByText("Research Assistant").first().hover();
    await frame(page, 3_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 8 — Streaming pact concept (~8s)
    // "Money that flows per slot. Pause anytime."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/agents/streaming`);
    await page.waitForLoadState("networkidle");
    await frame(page, 5_000);
    await smoothScroll(page, 200, 1_500);
    await frame(page, 1_500);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 9 — Cross-chain extension (~8s)
    // "Solana defines the rule. Ika signs across chains."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/watch-crosschain`);
    await page.waitForLoadState("networkidle");
    await frame(page, 6_000);
    await smoothScroll(page, 250, 1_500);
    await frame(page, 1_500);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 10 — Drop-in pay widget (~10s)
    // "Three lines into any site. Pay with Settle."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(
      `${PROD}/embed/pay?merchant=${BOB}&amount=2.50&memo=Invoice-1024`,
    );
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("PAY WITH SETTLE").first()).toBeVisible({
      timeout: 15_000,
    });
    await frame(page, 5_000);
    // Hover the Connect button to show it's interactive.
    await page.getByRole("button", { name: /Connect wallet to pay/i }).hover();
    await frame(page, 4_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 11 — Public feed empty-state (privacy-first messaging) (~6s)
    // "Receipts are private by default. Senders opt-in to publish."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/feed`);
    await page.waitForLoadState("networkidle");
    await frame(page, 5_500);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 12 — Developer docs (~14s)
    // "TypeScript, Python, Rust. Five lines and you're shipping."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/docs`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/pnpm add @settle\/sdk/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await frame(page, 4_000);
    await smoothScroll(page, 600, 3_000);
    await frame(page, 5_500);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 13 — Closing: same hash, verified again (~7s)
    // "Now you try it."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/verify?h=${PROVEN_HASH}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("VERIFIED").first()).toBeVisible({
      timeout: 15_000,
    });
    await frame(page, 6_500);

    await ctx.close();
  });
});
