/**
 * demo-recorder-wallet.spec.ts — Wallet-flow shots
 *
 * Companion to demo-recorder.spec.ts. Records the connected-wallet
 * shots that the production-only tour can't cover (Playwright can't
 * sign Phantom on production).
 *
 * How: pre-seed the E2E Persona burner key into localStorage, then
 * point Playwright at the audit-branch preview URL where the burner
 * adapter is enabled (NEXT_PUBLIC_E2E_BURNER=1 at compile time).
 *
 * Note on the URL: Playwright's recordVideo captures the VIEWPORT
 * only, not the browser chrome. The preview-branch URL never appears
 * in the .webm — only the page content does. So no cropping needed.
 *
 * Viewport: 1440×900 (slightly zoomed out from the production tour's
 * 1280×800 to fit more of each page without scroll).
 *
 * Run:
 *   pnpm exec playwright test e2e/demo-recorder-wallet.spec.ts \
 *     --project=chromium-demo-wallet \
 *     --headed
 *
 * Output: apps/web/demo-recordings/<run-id>/video.webm
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";
import bs58 from "bs58";

const PREVIEW =
  "https://use-settle-git-audit-e2e-burner-pratiikpys-projects.vercel.app";

const BOB = "DvzeYj2gE4Lu1uK8CDrkERWnBMXp5tGT2yVvc8KmUbAk";

function loadBurnerB58(): string {
  const path = resolve(process.cwd(), "..", "..", ".test-wallet.json");
  const arr = JSON.parse(readFileSync(path, "utf8")) as number[];
  return bs58.encode(Buffer.from(arr));
}

async function frame(page: Page, ms: number) {
  await page.waitForTimeout(ms);
}

async function smoothScroll(page: Page, totalPx: number, durationMs: number) {
  const steps = Math.max(1, Math.round(durationMs / 16));
  const stepPx = totalPx / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((dy) => window.scrollBy(0, dy), stepPx);
    await page.waitForTimeout(16);
  }
}

test.describe("Hackathon demo recording — wallet flows", () => {
  test.setTimeout(420_000);

  test("connected wallet tour — dashboard, send, streaming", async ({
    browser,
  }) => {
    const burnerB58 = loadBurnerB58();
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: {
        dir: "demo-recordings",
        size: { width: 1440, height: 900 },
      },
    });

    // Pre-seed the burner key BEFORE any page loads so the adapter
    // sees it on first paint and auto-connects.
    await ctx.addInitScript((b58: string) => {
      try {
        window.localStorage.setItem("settle-e2e-burner-key", b58);
      } catch {
        /* ignore */
      }
    }, burnerB58);

    const page = await ctx.newPage();

    // ═══════════════════════════════════════════════════════════════
    // PROLOGUE — Land on home, click Connect wallet → "E2E Persona"
    // Records the wallet selection step too (educational for judges:
    // shows that the same UI works with any Solana wallet adapter).
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PREVIEW}/?stay=1`);
    await page.waitForLoadState("networkidle");
    await frame(page, 3_000);

    const trigger = page.locator(".wallet-adapter-button-trigger").first();
    await trigger.waitFor({ state: "visible", timeout: 15_000 });
    await trigger.click();
    await frame(page, 1_500);
    const persona = page
      .locator(".wallet-adapter-modal-list li:has-text('E2E Persona')")
      .first();
    await persona.waitFor({ state: "visible", timeout: 8_000 });
    await persona.click();
    // Wait for connect to settle (button text becomes a truncated pubkey).
    await frame(page, 3_500);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 1 — Connected dashboard (~12s)
    // "Your wallet. Your agents. Your real receipts."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PREVIEW}/dashboard`);
    await page.waitForLoadState("networkidle");
    await frame(page, 6_000);
    await smoothScroll(page, 350, 2_000);
    await frame(page, 4_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 2 — Cards page with real allowlists (~10s)
    // "Each card pins a daily cap, an allowlist, an expiry."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PREVIEW}/cards`);
    await page.waitForLoadState("networkidle");
    await frame(page, 5_000);
    await smoothScroll(page, 300, 1_500);
    await frame(page, 3_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 3 — Ledger of real on-chain receipts (~10s)
    // "Every row traces back to a signature you produced."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PREVIEW}/ledger`);
    await page.waitForLoadState("networkidle");
    await frame(page, 5_000);
    await smoothScroll(page, 350, 1_800);
    await frame(page, 3_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 4 — Send flow with real on-chain confirmation (~30s)
    // "Pubkey, amount, memo. Wallet signs. Receipt lands on-chain."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PREVIEW}/send`);
    await page.waitForLoadState("networkidle");
    await frame(page, 3_000);

    // Switch to Pubkey tab, fill recipient + amount + memo
    await page.getByRole("button", { name: "Pubkey", exact: true }).click();
    await frame(page, 1_500);

    const recipientInput = page.getByPlaceholder(/7xKXz9pQrT4nMm2vL8aBcDeFgHiJkLmNoPqRsTuVwXyZ/);
    await recipientInput.fill(BOB);
    await frame(page, 1_000);

    await page.getByPlaceholder("10.00").fill("0.001");
    await frame(page, 1_000);

    await page.getByPlaceholder("pizza, rent, …").fill("hackathon-demo");
    await frame(page, 2_000);

    // Pay — burner auto-signs
    await page.getByRole("button", { name: /^Pay 0\.001 USDC/ }).click();

    // Wait for "Sent ✓" or similar success state.
    try {
      await expect(page.getByText(/Sent\s*✓|Sent ✔/i).first()).toBeVisible({
        timeout: 35_000,
      });
    } catch {
      // Fall back: even if the success label varies, we recorded the click.
    }
    await frame(page, 6_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 5 — Receipts page with the FRESH receipt at the top (~10s)
    // "Fresh receipt. Real signature. Solscan link."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PREVIEW}/receipts`);
    await page.waitForLoadState("networkidle");
    await frame(page, 5_000);
    await smoothScroll(page, 250, 1_200);
    await frame(page, 3_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 6 — Streaming pacts page (connected) (~10s)
    // "Money that flows per slot. Pause anytime."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PREVIEW}/agents/streaming`);
    await page.waitForLoadState("networkidle");
    await frame(page, 5_000);
    await smoothScroll(page, 200, 1_200);
    await frame(page, 3_000);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 7 — Agent templates with hire affordance (~12s)
    // "Three pre-built templates. Hire in one tx."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PREVIEW}/agents/templates`);
    await page.waitForLoadState("networkidle");
    await frame(page, 4_000);
    await page.getByText("Research Assistant").first().hover();
    await frame(page, 2_500);
    // Click into the template detail.
    await page.getByText("Research Assistant").first().click();
    await page.waitForLoadState("networkidle");
    await frame(page, 5_500);

    // ═══════════════════════════════════════════════════════════════
    // SHOT 8 — Audit log with real ALLOW rows (~10s)
    // "Every decision the signer made on your behalf."
    // ═══════════════════════════════════════════════════════════════
    await page.goto(`${PREVIEW}/audit`);
    await page.waitForLoadState("networkidle");
    await frame(page, 5_000);
    await smoothScroll(page, 300, 1_500);
    await frame(page, 3_000);

    await ctx.close();
  });
});
