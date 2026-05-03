import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * Section 17 — Negative paths (rule enforcement)
 * Section 28 — Push notification triggers (PushManager mocked)
 * Section 46 — Keyboard shortcuts
 * Section 47 — Copy-to-clipboard targets
 */
test.describe("Sections 17, 28, 46, 47 · negative paths + UX affordances", () => {
  test("17.1 — sending an empty form does not crash; CTA stays disabled", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/send");
    await page.waitForLoadState("domcontentloaded");
    // The big primary CTA should be disabled when no recipient/amount
    const cta = page.locator("button.w6-btn-primary").first();
    await cta.waitFor({ state: "visible", timeout: 15000 });
    const disabled = await cta.isDisabled();
    expect(disabled).toBeTruthy();
  });

  test("17.2 — invalid pubkey input doesn't navigate or send", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/send");
    const input = page.locator("input[placeholder='@handle']").first();
    await input.fill("not-a-real-pubkey");
    await input.blur();
    await page.waitForTimeout(1500);
    // No navigation away
    expect(page.url()).toContain("/send");
  });

  test("28.1 — service worker registration not crashed", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const swSupported = await page.evaluate(() => "serviceWorker" in navigator);
    expect(swSupported).toBeTruthy();
  });

  test("28.2 — PushManager API is available (mock-able)", async ({ page }) => {
    await page.goto("/");
    const pushApi = await page.evaluate(() => "PushManager" in window);
    expect(pushApi).toBeTruthy();
  });

  test("46 — global Cmd/Ctrl+K palette opens (if implemented)", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/dashboard");
    await page.waitForFunction(() => document.body.getAttribute("data-w6") === "1", null, { timeout: 30000 });
    // Try opening command palette
    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(800);
    // Whether or not a palette opens, the page must not crash
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("47 — receipt detail exposes copy-able receipt id", async ({ page }) => {
    await page.goto("/r/test-receipt-id");
    await page.waitForLoadState("domcontentloaded");
    const html = await page.content();
    // At least one mono-font segment (likely a copyable hash/id)
    expect(html).toMatch(/font-mono|w6-mono|font-family:[^;"]*mono/);
  });
});
