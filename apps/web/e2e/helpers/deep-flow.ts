/**
 * deep-flow — helpers for "real user" tests that verify the full flow:
 *   click button → wait for UI confirm → on-chain confirm → balance delta → UI history
 *
 * Used by e2e/deep-flows/*.spec.ts
 */
import type { Page, BrowserContext } from "@playwright/test";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export const USDC_MINT_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

export function rpcUrl(): string {
  return process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");
}

export function rpcConnection(): Connection {
  return new Connection(rpcUrl(), "confirmed");
}

export async function getSolBalance(pubkey: string): Promise<number> {
  const conn = rpcConnection();
  const lamports = await conn.getBalance(new PublicKey(pubkey), "confirmed");
  return lamports / 1e9;
}

export async function getUsdcBalance(pubkey: string): Promise<number> {
  const conn = rpcConnection();
  const ata = await getAssociatedTokenAddress(
    USDC_MINT_DEVNET,
    new PublicKey(pubkey),
  );
  try {
    const bal = await conn.getTokenAccountBalance(ata, "confirmed");
    return bal.value.uiAmount ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Wait until a tx signature is confirmed/finalized on devnet.
 * Polls every 1.5s, default 60s timeout. Returns the status object.
 */
export async function waitForSigConfirmed(
  sig: string,
  timeoutMs = 60_000,
): Promise<{ confirmationStatus: string; err: unknown }> {
  const conn = rpcConnection();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await conn.getSignatureStatus(sig, {
      searchTransactionHistory: true,
    });
    if (status.value?.confirmationStatus) {
      return {
        confirmationStatus: status.value.confirmationStatus,
        err: status.value.err,
      };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Tx not confirmed within ${timeoutMs}ms: ${sig}`);
}

/**
 * Extract the latest tx signature from the Solscan link rendered in
 * the send page after a successful send. Returns null if not found.
 */
export async function extractTxSigFromSolscan(page: Page): Promise<string | null> {
  const link = page.locator('a[href*="solscan.io"]').first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute("href");
  if (!href) return null;
  // Solscan tx URL: https://solscan.io/tx/<sig>?cluster=devnet
  const m = href.match(/\/tx\/([1-9A-HJ-NP-Za-km-z]{40,90})/);
  return m?.[1] ?? null;
}

/**
 * Connect the burner adapter via the wallet modal.
 * Pre-condition: page is loaded, burner key is seeded in localStorage.
 */
export async function connectBurner(page: Page) {
  await page.goto("/?stay=1");
  await page.locator(".wallet-adapter-button-trigger").first().click();
  await page
    .locator(".wallet-adapter-modal-list li:has-text('E2E Persona')")
    .first()
    .click();
  await page
    .locator(".wallet-adapter-modal")
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * Wait for the W6AppShell hydration marker on `data-w6=1`.
 * Pages without W6AppShell silently no-op.
 */
export async function waitForW6Hydrated(page: Page, timeout = 30_000) {
  await page
    .waitForFunction(
      () => document.body.getAttribute("data-w6") === "1",
      null,
      { timeout },
    )
    .catch(() => {});
}
