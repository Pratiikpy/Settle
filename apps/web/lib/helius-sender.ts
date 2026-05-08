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

  // Append a Helius Sender tip (required ≥ 200000 lamports to one of Helius's
  // tip wallets, otherwise sendTransaction returns -32602). Rotate across the
  // 4 published wallets so we don't all land on the same one. List source:
  // the error message Helius returns when the tip target is wrong.
  if (jitoTipLamports !== undefined && jitoTipLamports > 0) {
    const HELIUS_TIP_WALLETS = [
      "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
      "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
      "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
      "5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn",
      "2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD",
      "2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ",
      "wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF",
    ];
    const idx = Math.floor(Math.random() * HELIUS_TIP_WALLETS.length);
    const tipAccount = new PublicKey(HELIUS_TIP_WALLETS[idx]!);
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

/**
 * True iff the Sender path will actually be taken (HELIUS_API_KEY configured).
 * False means sendViaHeliusSender will silently fall back to the vanilla RPC
 * `sendRawTransaction`. UI surfaces use this to badge a receipt's submission
 * method honestly: "Helius Sender · Jito bundle" vs "RPC sendRawTransaction".
 */
export function isHeliusSenderAvailable(): boolean {
  return Boolean(process.env.HELIUS_API_KEY);
}

export type SubmissionMethod = "helius_sender_jito" | "rpc_fallback" | "wallet_send";

/**
 * Best-effort label for how a tx hit the network. The proxy path uses
 * Helius Sender when the API key is set; otherwise the lib falls back to RPC.
 * Wallet-signed tx (e.g. a /send transfer) is always wallet_send because the
 * wallet adapter posts directly via sendRawTransaction.
 */
export function describeSubmissionMethod(
  source: "proxy" | "wallet",
): SubmissionMethod {
  if (source === "wallet") return "wallet_send";
  return isHeliusSenderAvailable() ? "helius_sender_jito" : "rpc_fallback";
}
