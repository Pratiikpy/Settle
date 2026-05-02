import { test, expect } from "@playwright/test";

/**
 * D2 — `/embed/pay` regression coverage.
 *
 * The `<settle-pay>` web component opens this route in an iframe.
 * The route has a strict contract:
 *   1. Renders a "Pay $amount with Settle" surface when params are valid.
 *   2. Falls back to "Invalid pay request" when merchant or amount fail
 *      validation, AND emits postMessage `{type: "settle:error"}` +
 *      `{type: "settle:closed"}` when the user clicks Close.
 *   3. The valid-state Cancel button emits `{type: "settle:closed"}`
 *      so the host page can dispose the iframe.
 *
 * These assertions are cheap and fast — they don't actually run a
 * payment (that needs a funded wallet). They prove the surface +
 * postMessage envelopes match the contract `<settle-pay>` listens for
 * in `packages/web-components/src/pay.ts`.
 */

const VALID_MERCHANT = "HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD";

test.describe("D2 — /embed/pay regression", () => {
  test("renders pay surface with valid params", async ({ page }) => {
    await page.goto(
      `/embed/pay?merchant=${VALID_MERCHANT}&amount=0.50&note=Order%20%231234`,
    );
    await expect(page.getByText("Pay with Settle", { exact: false })).toBeVisible();
    await expect(page.getByText("$0.50", { exact: false })).toBeVisible();
    await expect(page.getByText("Order #1234", { exact: false })).toBeVisible();
    // Truncated merchant pubkey should appear (first 8 chars)
    await expect(page.getByText("HU4piq8b", { exact: false })).toBeVisible();
  });

  test("renders invalid-request surface on bad merchant", async ({ page }) => {
    await page.goto(`/embed/pay?merchant=not-a-pubkey&amount=0.50`);
    await expect(page.getByText("Invalid pay request")).toBeVisible();
    await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  });

  test("renders invalid-request surface on missing amount", async ({ page }) => {
    await page.goto(`/embed/pay?merchant=${VALID_MERCHANT}`);
    await expect(page.getByText("Invalid pay request")).toBeVisible();
  });

  test("renders invalid-request surface on negative amount", async ({ page }) => {
    await page.goto(`/embed/pay?merchant=${VALID_MERCHANT}&amount=-1`);
    await expect(page.getByText("Invalid pay request")).toBeVisible();
  });

  test("invalid-state Close button posts settle:error + settle:closed to parent", async ({
    page,
  }) => {
    // Hook window.parent.postMessage so we can capture what the embed sends.
    // The embed sees window.parent as the test page itself when not in an iframe.
    await page.goto(`/embed/pay?merchant=invalid&amount=0`);
    await page.evaluate(() => {
      (window as unknown as { __settleMessages: unknown[] }).__settleMessages = [];
      const orig = window.postMessage.bind(window);
      window.postMessage = ((msg: unknown, target: string) => {
        (window as unknown as { __settleMessages: unknown[] }).__settleMessages.push(msg);
        return orig(msg, target);
      }) as typeof window.postMessage;
    });
    await page.getByRole("button", { name: "Close" }).click();
    const messages = await page.evaluate(
      () => (window as unknown as { __settleMessages: unknown[] }).__settleMessages,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "settle:error", code: "invalid_params" }),
        expect.objectContaining({ type: "settle:closed" }),
      ]),
    );
  });

  test("valid-state Cancel button posts settle:closed to parent", async ({
    page,
  }) => {
    await page.goto(`/embed/pay?merchant=${VALID_MERCHANT}&amount=0.50`);
    await page.evaluate(() => {
      (window as unknown as { __settleMessages: unknown[] }).__settleMessages = [];
      const orig = window.postMessage.bind(window);
      window.postMessage = ((msg: unknown, target: string) => {
        (window as unknown as { __settleMessages: unknown[] }).__settleMessages.push(msg);
        return orig(msg, target);
      }) as typeof window.postMessage;
    });
    await page.getByRole("button", { name: "Cancel" }).click();
    const messages = await page.evaluate(
      () => (window as unknown as { __settleMessages: unknown[] }).__settleMessages,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "settle:closed" }),
      ]),
    );
  });
});
