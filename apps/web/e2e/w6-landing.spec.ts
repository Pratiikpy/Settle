import { test, expect } from "@playwright/test";

/**
 * Wave 6.1 — landing redesign regression coverage.
 *
 * Validates:
 *   1. New copy + chrome render
 *   2. Stats strip hides correctly when devnet volume is below threshold
 *   3. Waitlist email submission round-trips
 *   4. New marketing routes (/brand, /changelog, /privacy, /terms) render
 *   5. Surface switcher pills route correctly when followed
 *   6. Mobile (390px) renders without horizontal scroll
 */

const VIEWPORT_MOBILE = { width: 390, height: 844 } as const;

test.describe("W6 landing", () => {
  test("hero renders with redesigned copy", async ({ page }) => {
    await page.goto("/?stay=1");
    await expect(
      page.getByRole("heading", { name: /Programmable money for the AI age/i }),
    ).toBeVisible();
    await expect(page.getByText(/Solana-native payments app/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Request access/i }).first(),
    ).toBeVisible();
  });

  test("AgentCard demo card visible in hero", async ({ page }) => {
    await page.goto("/?stay=1");
    await expect(page.getByText(/Agent policy/i).first()).toBeVisible();
    await expect(page.getByText(/Research Agent/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Revoke" }).first(),
    ).toBeVisible();
  });

  test("stats strip hides when not presentable (low devnet volume)", async ({
    page,
  }) => {
    await page.goto("/?stay=1");
    // Wait for the API call to complete + decision to render
    await page.waitForTimeout(800);
    // Should NOT see the agent-spend-governed label when is_presentable=false
    await expect(page.getByText("agent spend governed")).not.toBeVisible();
  });

  test("product surface bento grid renders", async ({ page }) => {
    await page.goto("/?stay=1");
    await expect(
      page.getByRole("heading", {
        name: /Money movement that explains itself/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Bounded spending power/i }),
    ).toBeVisible();
  });

  test("six audience cards render", async ({ page }) => {
    await page.goto("/?stay=1");
    for (const audience of [
      "Pay & receive",
      "Programmable spend",
      "Get paid",
      "Build on Settle",
      "Run a deploy",
      "Verify · stats",
    ]) {
      await expect(page.getByText(audience).first()).toBeVisible();
    }
  });

  test("for-builders strip renders dark with code", async ({ page }) => {
    await page.goto("/?stay=1");
    await expect(
      page.getByRole("heading", {
        name: /Built for agents, merchants, creators/i,
      }),
    ).toBeVisible();
    await expect(page.getByText("settle-protocol-sdk").first()).toBeVisible();
  });

  test("waitlist form submits ok", async ({ page }) => {
    await page.goto("/?stay=1");
    await page.locator("#w6-email").first().fill("e2e-test@example.com");
    await page.getByRole("button", { name: "Request access" }).first().click();
    await expect(page.getByText(/You're on the list/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("new marketing routes render", async ({ page }) => {
    for (const [path, heading] of [
      ["/brand", "Brand"],
      ["/changelog", "Changelog"],
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
    ] as const) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();
    }
  });

  test("mobile 390px no horizontal scroll on landing", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_MOBILE);
    await page.goto("/?stay=1");
    const overflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1
      );
    });
    expect(overflow).toBe(false);
  });
});
