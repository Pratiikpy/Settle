import type { FullConfig } from "@playwright/test";

/**
 * Pre-warm Next.js dev routes before the test suite runs.
 *
 * Next.js dev server compiles each route on first hit (30-60s cold).
 * If we don't pre-warm, every test's first .goto() races against
 * compile and frequently times out. A single warm-up pass at suite
 * start trades ~3min upfront for stable per-test timing.
 *
 * Production builds don't need this — `next start` serves pre-compiled
 * routes instantly.
 */

const ROUTES_TO_WARM = [
  "/",
  "/dashboard",
  "/cards",
  "/cards/new",
  "/wishes",
  "/allowances",
  "/groups",
  "/spending",
  "/agents",
  "/audit",
  "/ledger",
  "/feed",
  "/send",
  "/settings",
];

export default async function globalSetup(_config: FullConfig) {
  const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  console.log(`[global-setup] Pre-warming ${ROUTES_TO_WARM.length} routes at ${base}…`);
  const start = Date.now();
  for (const path of ROUTES_TO_WARM) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(120_000),
      });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[global-setup]  ${path} → ${r.status} (${elapsed}s)`);
    } catch (e) {
      console.log(`[global-setup]  ${path} → FAILED ${(e as Error).message}`);
    }
  }
  const totalElapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[global-setup] Done in ${totalElapsed}s.`);
}
