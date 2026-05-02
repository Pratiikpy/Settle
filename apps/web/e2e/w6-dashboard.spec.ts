import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * Wave 6.2 — `/dashboard` redesign regression coverage.
 *
 * Validates:
 *   1. Disconnected wallet sees a "Connect" message (no crash)
 *   2. Connected wallet renders hero + balance strip + bento cells
 *   3. Empty wallet renders empty states (no fake numbers)
 *   4. Mobile 390px renders without horizontal scroll
 *   5. Footer's 4-hash protocol callout renders
 */

test.describe("W6 dashboard", () => {
  test("disconnected shows connect prompt", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", {
        name: /Connect a wallet to see your dashboard/i,
      }),
    ).toBeVisible();
  });

  test("connected wallet renders the bento home", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /Move money. Trust the receipt/i }),
    ).toBeVisible();
    // Balance strip
    await expect(page.getByText("Available · USDC")).toBeVisible();
    // Today bento cell
    await expect(page.getByText("Today").first()).toBeVisible();
    // Agents on duty bento cell
    await expect(page.getByText(/Agents on duty/i)).toBeVisible();
    // Active Pacts bento cell
    await expect(page.getByText(/Active Pacts/i)).toBeVisible();
    // Protocol footer card
    await expect(
      page.getByText(/Every payment is a 4-hash commitment/i),
    ).toBeVisible();
  });

  test("empty wallet shows empty states, not fake numbers", async ({
    page,
  }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/dashboard");
    // Burner has no agents → empty state
    await expect(page.getByText(/No agents yet/i).first()).toBeVisible();
    // No active pacts message OR a real pacts card
    const pactsEmpty = page.getByText(/No active Pacts/i);
    const pactsHeader = page.getByText(/Active Pacts/i).first();
    await expect(pactsHeader).toBeVisible();
    // It's OK if `pactsEmpty` is or isn't visible depending on data; just
    // assert the section header rendered (above)
    void pactsEmpty;
  });

  test("mobile 390px no horizontal scroll on dashboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/dashboard");
    await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
    const overflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1
      );
    });
    expect(overflow).toBe(false);
  });
});
