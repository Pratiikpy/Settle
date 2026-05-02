import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * Layer B nav smoke — visit every Phase 5 surface with the burner
 * connected. Each page must:
 *   1. Return HTTP 200
 *   2. Render without unhandled JS errors
 *   3. Show a non-empty <main> region (= the layout actually mounted)
 *
 * Doesn't assert specific content — that's per-page test territory.
 * This is the canary that React-layer wiring isn't broken across the
 * full site after a refactor.
 */

const PHASE5_ROUTES: Array<{ path: string; mustContain?: string }> = [
  { path: "/dashboard", mustContain: "Move money" },
  { path: "/cards" },
  { path: "/wishes" },
  { path: "/allowances" },
  { path: "/groups" },
  { path: "/spending" },
  { path: "/agents" },
  { path: "/audit" },
  { path: "/ledger" },
  { path: "/feed" },
  { path: "/send" },
  { path: "/settings" },
  // EXECUTE_PLAN Wave 1–2 additions
  { path: "/settings/exports" }, // F2.12 / B3 compliance export UI
  { path: "/capabilities/discover" }, // F3.11 NL capability discovery
];

test.describe("Layer B — nav smoke (all Phase 5 surfaces render with burner)", () => {
  for (const route of PHASE5_ROUTES) {
    test(`${route.path} renders without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => {
        errors.push(`pageerror: ${err.message}`);
      });
      // Filter out noisy-but-harmless console errors (devnet RPC, missing
      // optional analytics endpoints, hydration-state warnings on dev mode).
      const harmlessPatterns = [
        /UnsafeBurnerWalletAdapter/i,
        /Failed to fetch/, // burner has no on-chain history
        /Hydration/i, // Next 15 dev-mode chatter
        /404/i, // optional /api/* endpoints not seeded
        /400/i, // wallet-connect race fires endpoints with empty pubkey (caught by .catch in callers)
        /vapid/i, // push notifications without VAPID key
        /Service Worker/i,
      ];
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (harmlessPatterns.some((p) => p.test(text))) return;
        errors.push(`console.error: ${text}`);
      });

      // First connect on home so wallet state persists across navigation.
      await page.goto("/");
      await connectBurner(page);

      // Now navigate to the target.
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} HTTP status`).toBe(200);

      // Main region exists and isn't empty.
      const main = page.locator("main");
      await expect(main).toBeVisible();
      const mainText = await main.textContent();
      expect(mainText?.length ?? 0).toBeGreaterThan(50);

      if (route.mustContain) {
        await expect(page.getByText(route.mustContain).first()).toBeVisible({
          timeout: 5_000,
        });
      }

      // No unhandled errors during render.
      expect(errors).toEqual([]);
    });
  }
});
