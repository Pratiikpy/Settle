/**
 * Light Protocol ZK Compression — server-only mint helpers for the
 * compress-cron worker. Wraps the legacy @lightprotocol/compressed-token
 * API which is the simplest path to a public-good demo without writing
 * a Light System Program CPI from inside our Anchor program.
 *
 * Why legacy v1 API over v3 light-token:
 *   - v3 requires a separate compressed-mint Merkle context fetch per call,
 *     which couples the demo to Photon RPC availability for both reads and
 *     writes. v1 mintTo handles state-tree selection internally.
 *   - v1 is what the Light Protocol CLI uses (`light create-mint`), so the
 *     mint produced here is fully interoperable with the canonical reference.
 *   - Hackathon ergonomics: 3-line setup vs ~30-line v3 plumbing.
 */

import { Keypair, PublicKey, type ConfirmOptions } from "@solana/web3.js";
import bs58 from "bs58";
import { createRpc, type Rpc } from "@lightprotocol/stateless.js";
import { mintTo } from "@lightprotocol/compressed-token";

export interface ZkReceiptConfig {
  rpcUrl: string;
  authorityKeypair: Keypair;
  mint: PublicKey;
}

export function loadZkReceiptConfig(rpcUrl: string): ZkReceiptConfig | null {
  const privBase58 = process.env.SETTLE_ZK_RECEIPT_AUTHORITY_PRIVKEY;
  const mintStr = process.env.SETTLE_ZK_RECEIPT_MINT;
  if (!privBase58 || !mintStr) return null;
  let secret: Uint8Array;
  try {
    secret = bs58.decode(privBase58);
  } catch {
    return null;
  }
  if (secret.length !== 64) return null;

  let mint: PublicKey;
  try {
    mint = new PublicKey(mintStr);
  } catch {
    return null;
  }

  return {
    rpcUrl,
    authorityKeypair: Keypair.fromSecretKey(secret),
    mint,
  };
}

export function buildLightRpc(rpcUrl: string): Rpc {
  // Helius bundles standard JSON-RPC + Photon under one URL — passing it as
  // all three positional args lets the SDK do both reads (compressed account
  // queries, validity proofs) and writes (mintTo, transfer) without separate
  // endpoints. On non-Helius RPCs you'd pass distinct URLs here.
  return createRpc(rpcUrl, rpcUrl, rpcUrl);
}

export interface MintCompressedReceiptResult {
  signature: string;
  mintAddress: string;
}

/**
 * Mint exactly 1 unit of the SETTLE_RECEIPT compressed token to `recipient`.
 * The recipient never signs — the mint authority is sufficient. Confirm
 * commitment is "confirmed" because that's the level at which Photon will
 * already reflect the state-tree update.
 *
 * Throws on RPC failure / state-tree contention. Caller (compress-cron)
 * should swallow per-row failures and try the next receipt.
 */
export async function mintCompressedReceipt(
  cfg: ZkReceiptConfig,
  recipient: PublicKey,
  confirmOptions?: ConfirmOptions,
): Promise<MintCompressedReceiptResult> {
  const rpc = buildLightRpc(cfg.rpcUrl);
  const sig = await mintTo(
    rpc,
    cfg.authorityKeypair,
    cfg.mint,
    recipient,
    cfg.authorityKeypair,
    1,
    undefined,
    undefined,
    confirmOptions ?? { commitment: "confirmed", skipPreflight: false },
  );
  return {
    signature: sig,
    mintAddress: cfg.mint.toBase58(),
  };
}
