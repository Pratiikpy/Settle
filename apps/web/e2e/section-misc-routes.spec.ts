import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * Surface-level route smoke for any remaining uncovered routes.
 */
const PUBLIC_ROUTES = [
  "/",
  "/brand",
  "/changelog",
  "/privacy",
  "/terms",
  "/feed",
  "/leaderboard",
  "/capabilities",
  "/capabilities/discover",
  "/stats",
  "/verify",
  "/verify-build",
  "/sandbox",
  "/import",
];

const AUTHED_ROUTES = [
  "/dashboard",
  "/cards",
  "/cards/new",
  "/wishes",
  "/groups",
  "/allowances",
  "/spending",
  "/activity",
  "/settings",
  "/agents",
  "/audit",
  "/at/me",
];

test.describe("Misc · route smoke (public)", () => {
  for (const path of PUBLIC_ROUTES) {
    test(`public ${path}`, async ({ page }) => {
      const r = await page.goto(path);
      const status = r?.status() ?? 0;
      expect([200, 404].includes(status)).toBeTruthy();
    });
  }
});

test.describe("Misc · route smoke (authed)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
  });
  for (const path of AUTHED_ROUTES) {
    test(`authed ${path}`, async ({ page }) => {
      const r = await page.goto(path);
      const status = r?.status() ?? 0;
      expect([200, 404].includes(status)).toBeTruthy();
      await expect(page.locator("body").first()).toBeVisible();
    });
  }
});
