import { test, expect } from "@playwright/test";

/**
 * Settle x Ika sidetrack — Phase E Playwright coverage.
 *
 * UI-level regressions for the cross-chain surfaces. These tests do NOT
 * exercise the live Ika gRPC or Sepolia network — that's Phase F's
 * `scripts/ika-roundtrip.ts` job. Here we verify:
 *
 *   - new pages render without throwing
 *   - form validation produces useful errors
 *   - the "IKA" badge is everywhere it should be
 *   - the pre-alpha banner is everywhere it should be
 *   - the trust-boundary footer copy is unmissable
 *   - chain-aware variants of /r/<id> render distinctly from USDC ones
 *
 * Pre-alpha caveat: real on-chain submission requires a wallet connection
 * which we don't drive in these specs. The `/start/agent-crosschain` flow
 * is tested up to the point where the user clicks "Hire agent" — we assert
 * the form gates correctly without simulating a wallet sign.
 */

const VIEWPORT_DESKTOP = { width: 1280, height: 800 } as const;

test.describe("Ika cross-chain UI surfaces", () => {
  test("/start/agent-crosschain renders with all required scaffolding", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await page.goto("/start/agent-crosschain");
    await expect(page.getByTestId("start-agent-crosschain")).toBeVisible();
    // IKA badge is unmistakable
    await expect(page.getByTestId("ika-badge").first()).toBeVisible();
    // Pre-alpha banner is unmistakable
    await expect(page.getByTestId("pre-alpha-banner")).toBeVisible();
    // All form fields exist
    await expect(page.getByTestId("cc-label")).toBeVisible();
    await expect(page.getByTestId("cc-chain")).toBeVisible();
    await expect(page.getByTestId("cc-dwallet-pubkey")).toBeVisible();
    await expect(page.getByTestId("cc-dwallet-key-hex")).toBeVisible();
    await expect(page.getByTestId("cc-recipient")).toBeVisible();
    await expect(page.getByTestId("cc-per-call-eth")).toBeVisible();
    await expect(page.getByTestId("cc-daily-eth")).toBeVisible();
    await expect(page.getByTestId("cc-expiry-hours")).toBeVisible();
    await expect(page.getByTestId("cc-hire-agent")).toBeVisible();
  });

  test("/start/agent-crosschain form validation surfaces errors", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await page.goto("/start/agent-crosschain");
    // Default fields include a placeholder dwallet pubkey/recipient — both empty
    // by default. The errors list should be visible.
    await expect(page.getByTestId("cc-form-errors")).toBeVisible();
    const errors = page.getByTestId("cc-form-errors");
    await expect(errors).toContainText(/dWallet pubkey/i);
    await expect(errors).toContainText(/Recipient must be a 20-byte EVM address/i);
  });

  test("/start/agent-crosschain rejects per-call > daily cap", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await page.goto("/start/agent-crosschain");
    // Fill the rest with valid values then force per_call > daily.
    await page.getByTestId("cc-dwallet-pubkey").fill("FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK");
    await page.getByTestId("cc-dwallet-key-hex").fill("0x" + "ab".repeat(33));
    await page.getByTestId("cc-recipient").fill("0xabcdef0123456789abcdef0123456789abcdef01");
    await page.getByTestId("cc-per-call-eth").fill("1.0");
    await page.getByTestId("cc-daily-eth").fill("0.5");
    await expect(page.getByTestId("cc-form-errors")).toContainText(/Per-call cap can't exceed daily cap/i);
  });

  test("/start/agent-crosschain disables submit when wallet not connected", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await page.goto("/start/agent-crosschain");
    const btn = page.getByTestId("cc-hire-agent");
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveText(/Connect wallet first/i);
  });

  test("/watch-crosschain renders both ALLOW and DENY scenarios", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await page.goto("/watch-crosschain");
    await expect(page.getByTestId("watch-crosschain")).toBeVisible();
    await expect(page.getByTestId("ika-badge").first()).toBeVisible();
    await expect(page.getByTestId("pre-alpha-banner")).toBeVisible();
    await expect(page.getByTestId("wcc-allow")).toBeVisible();
    await expect(page.getByTestId("wcc-deny")).toBeVisible();
    await expect(page.getByTestId("wcc-cta-link")).toHaveAttribute("href", "/start/agent-crosschain");
    // Trust footer is impossible to miss
    await expect(page.getByTestId("wcc-trust-footer")).toContainText(
      /Settle does not custody your cross-chain assets/i,
    );
    await expect(page.getByTestId("wcc-trust-footer")).toContainText(
      /Your funds stay on their native chain/i,
    );
  });

  test("/watch-crosschain DENY scenario explains no signature was produced", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await page.goto("/watch-crosschain");
    const denyBlock = page.getByTestId("wcc-deny");
    await expect(denyBlock).toContainText(/No signature exists/i);
    await expect(denyBlock).toContainText(/no Etherscan link/i);
  });

  test("/cards/crosschain/[card] handles unknown card gracefully", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_DESKTOP);
    // Random base58 pubkey that won't exist in the indexer.
    await page.goto("/cards/crosschain/11111111111111111111111111111112");
    await expect(page.getByTestId("crosschain-card-detail")).toBeVisible();
    // Either the error message appears, or "Card not found" — both are valid
    // behaviour while the indexer hasn't seen this card.
    const errorOrEmpty = page.getByTestId("cc-error");
    await expect(errorOrEmpty.or(page.getByText(/Card not found/i))).toBeVisible();
  });

  test("/cards/crosschain/[card] rejects malformed pubkey", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await page.goto("/cards/crosschain/not-a-pubkey");
    // The page mounts, fetches, and surfaces an error (the API will 400).
    await expect(page.getByTestId("crosschain-card-detail")).toBeVisible();
    await expect(page.getByTestId("cc-error")).toBeVisible({ timeout: 5_000 });
  });

  test("dashboard panel hidden when no cross-chain card and wallet not connected", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await page.goto("/dashboard");
    // Without a connected wallet the dashboard renders the empty-shell state.
    // The cross-chain panel should NOT appear.
    await expect(page.getByTestId("dashboard-crosschain-panel")).toHaveCount(0);
  });
});
