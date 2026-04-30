/**
 * Helius Sender — ultra-low-latency tx submission with priority fee + region routing.
 *
 * Docs: https://www.helius.dev/docs/sender
 *
 * Sender endpoints:
 *   - Default (auto-region):  https://sender.helius-rpc.com/fast
 *   - Specific regions:       https://<region>.sender.helius-rpc.com/fast
 *     (slc, ewr, lon, fra, sin, tyo)
 *
 * Pre-conditions for Sender:
 *   1. Tx must include a Compute Budget priority fee instruction
 *   2. Tx must include a small Jito tip (optional but improves landing rate)
 *   3. Tx must be a versioned transaction (or legacy with feePayer set)
 *   4. Use skipPreflight: true
 *
 * Falls back to standard `connection.sendRawTransaction` if HELIUS_API_KEY is unset.
 */

import {
  Connection,
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

const SENDER_REGIONS = ["slc", "ewr", "lon", "fra", "sin", "tyo"] as const;
export type SenderRegion = (typeof SENDER_REGIONS)[number];

function getSenderUrl(region?: SenderRegion): string {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) return "";
  if (region) return `https://${region}.sender.helius-rpc.com/fast?api-key=${apiKey}`;
  return `https://sender.helius-rpc.com/fast?api-key=${apiKey}`;
}

/** Add Compute Budget priority fee + Jito tip to a Transaction (mutates). */
export function addPriorityFeeAndTip(params: {
  tx: Transaction;
  microLamportsPerCu: number; // priority fee per compute unit
  computeUnitLimit?: number;  // optional CU limit (default: leave unset)
  jitoTipLamports?: number;   // optional Jito tip (default 1000 lamports = 0.000001 SOL)
  feePayer: PublicKey;
}): void {
  const { tx, microLamportsPerCu, computeUnitLimit, jitoTipLamports, feePayer } = params;

  // Prepend ComputeBudget ixs (Solana convention: ComputeBudget ixs go first)
  if (computeUnitLimit !== undefined) {
    tx.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
    );
  }
  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: microLamportsPerCu }),
  );

  // Append Jito tip (optional but recommended for Sender)
  if (jitoTipLamports !== undefined && jitoTipLamports > 0) {
    // Jito tip accounts (mainnet) — for devnet we just transfer to the system program / a tip account
    // Pick the first official tip account; rotate in production for fairness.
    const tipAccount = new PublicKey("96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5");
    tx.instructions.push(
      SystemProgram.transfer({
        fromPubkey: feePayer,
        toPubkey: tipAccount,
        lamports: jitoTipLamports,
      }),
    );
  }
}

/**
 * Submit a signed transaction via Helius Sender.
 * Returns the tx signature on success; throws on failure.
 *
 * If HELIUS_API_KEY is not set, falls back to vanilla sendRawTransaction.
 */
export async function sendViaHeliusSender(
  fallbackConn: Connection,
  signedTx: Transaction | VersionedTransaction,
  options: {
    region?: SenderRegion;
    skipPreflight?: boolean;
    maxRetries?: number;
  } = {},
): Promise<string> {
  const senderUrl = getSenderUrl(options.region);
  const skipPreflight = options.skipPreflight ?? true;

  const rawTx =
    signedTx instanceof VersionedTransaction
      ? signedTx.serialize()
      : signedTx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const rawB58 = Buffer.from(rawTx).toString("base64");

  if (!senderUrl) {
    // Fallback: standard RPC
    return fallbackConn.sendRawTransaction(rawTx, {
      skipPreflight,
      preflightCommitment: "confirmed",
      maxRetries: options.maxRetries ?? 0,
    });
  }

  const res = await fetch(senderUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [
        rawB58,
        {
          encoding: "base64",
          skipPreflight,
          maxRetries: options.maxRetries ?? 0,
          preflightCommitment: "confirmed",
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Helius Sender HTTP ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`Helius Sender RPC error: ${json.error.message}`);
  if (!json.result) throw new Error("Helius Sender: missing result");
  return json.result;
}

/**
 * Send + confirm via Helius Sender. Confirmation still uses the regular RPC connection.
 */
export async function sendAndConfirmViaHeliusSender(
  conn: Connection,
  signedTx: Transaction | VersionedTransaction,
  options: {
    region?: SenderRegion;
    skipPreflight?: boolean;
    maxRetries?: number;
    blockhash: string;
    lastValidBlockHeight: number;
  },
): Promise<string> {
  const sig = await sendViaHeliusSender(conn, signedTx, options);
  await conn.confirmTransaction(
    {
      signature: sig,
      blockhash: options.blockhash,
      lastValidBlockHeight: options.lastValidBlockHeight,
    },
    "confirmed",
  );
  return sig;
}
