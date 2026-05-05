/**
 * demo-recorder.spec.ts — Hackathon demo recorder
 *
 * One-take Playwright spec that drives the locked-down demo flow from
 * PRE_DEMO_FIX_AND_GO_NO_GO.md and saves a clean .webm video.
 *
 * PRODUCTION-ONLY MODE: every frame runs on `use-settle.vercel.app`.
 * No preview branch URL ever appears on screen — this matches the
 * "judges should see confidence, not a workaround" rule from the
 * pre-demo report. Trade-off: we don't record a fresh send. The demo
 * is a proof-tour (judges can reproduce any /verify?h=... themselves)
 * not a click-tour. See PRE_DEMO_FIX_AND_GO_NO_GO.md §5 for rationale.
 *
 * Run:
 *   pnpm exec playwright test e2e/demo-recorder.spec.ts \
 *     --project=chromium-demo \
 *     --headed
 *
 * Output: apps/web/demo-recordings/<run-id>/video.webm
 *
 * The harness records a single 75-second take. If anything goes wrong
 * (e.g. Supabase 5xx, Vercel cold-start), the video file is still saved
 * and the test fails — re-run, don't edit the video.
 */

import { test, expect, type Page } from "@playwright/test";

const PROD = "https://use-settle.vercel.app";

// Public-only identities (safe to commit)
const BOB = "DvzeYj2gE4Lu1uK8CDrkERWnBMXp5tGT2yVvc8KmUbAk";

// A proven receipt_hash from a confirmed devnet send during the audit.
// Permanent — the receipt is in production Supabase + on-chain.
const PROVEN_HASH =
  "ca50ca04e587acecbfefdab0bfdcee5351a521f33797d201417a9c3a238cc902";
const PROVEN_REQUEST_ID = "93de12a1-01c1-4fc8-83c0-1bff28f5a870";

async function frame(page: Page, ms: number) {
  // Show a frame for `ms` so the recording captures the state before
  // moving on. Each demo frame uses this to give the eye time to read.
  await page.waitForTimeout(ms);
}

test.describe("Hackathon demo recording", () => {
  test("locked demo flow — production-only proof-tour", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: {
        dir: "demo-recordings",
        size: { width: 1280, height: 800 },
      },
    });
    const page = await ctx.newPage();

    // ═══════════════════════════════════════════════════════════════
    // FRAME 1 — production landing with live agent activity ticker
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/`);
    await page.waitForLoadState("networkidle");
    // Wait for the ticker to render at least one entry (proves the
    // landing is showing real on-chain receipts, not scenario data).
    await expect(page.locator("text=settle://live")).toBeVisible({
      timeout: 10_000,
    });
    await frame(page, 6_000);

    // ═══════════════════════════════════════════════════════════════
    // FRAME 2 — production /verify with the proven receipt hash
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/verify?h=${PROVEN_HASH}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("VERIFIED").first()).toBeVisible({
      timeout: 10_000,
    });
    // Highlight the four hashes — judge should see "All 4 hashes match"
    await expect(
      page.getByText("All 4 hashes match the canonical JSON.").first(),
    ).toBeVisible();
    await frame(page, 8_000);

    // ═══════════════════════════════════════════════════════════════
    // FRAME 3 — production /r/[id] receipt detail
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/r/${PROVEN_REQUEST_ID}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Verified").first()).toBeVisible({
      timeout: 10_000,
    });
    await frame(page, 6_000);

    // ═══════════════════════════════════════════════════════════════
    // FRAME 4 — production /stats live counters
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/stats`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("RECEIPTS · 24H").first()).toBeVisible({
      timeout: 10_000,
    });
    await frame(page, 6_000);

    // ═══════════════════════════════════════════════════════════════
    // FRAME 5 — production /dashboard (chrome-less, judges land here)
    // Frame proves: agent rows render with real labels (#40 fix),
    // recent receipts appear (Bug #21 systemic fix).
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/dashboard`);
    await page.waitForLoadState("networkidle");
    await frame(page, 8_000);

    // ═══════════════════════════════════════════════════════════════
    // FRAME 6 — production /agents/streaming (read-only view)
    // Shows: streaming pact concept, pause/resume affordance.
    // No clicking — demo doesn't trigger spend_via_pact (Bug #26).
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/agents/streaming`);
    await page.waitForLoadState("networkidle");
    await frame(page, 8_000);

    // ═══════════════════════════════════════════════════════════════
    // FRAME 7 — production /embed/pay widget (no wallet needed to render)
    // ═══════════════════════════════════════════════════════════════
    await page.goto(
      `${PROD}/embed/pay?merchant=${BOB}&amount=2.50&memo=Invoice-1024`,
    );
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("PAY WITH SETTLE").first()).toBeVisible({
      timeout: 10_000,
    });
    await frame(page, 8_000);

    // ═══════════════════════════════════════════════════════════════
    // FRAME 8 — production /docs (developer pitch)
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/docs`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/pnpm add @settle\/sdk/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await frame(page, 10_000);

    // ═══════════════════════════════════════════════════════════════
    // FRAME 9 — closing shot: back on /verify with the SAME proven hash
    // The judge can paste this hash on production themselves and get
    // the same VERIFIED result. That's the demo.
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PROD}/verify?h=${PROVEN_HASH}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("VERIFIED").first()).toBeVisible();
    await frame(page, 7_000);

    // Close the page so the recording finalizes cleanly.
    await ctx.close();
  });
});
