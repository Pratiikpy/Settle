/**
 * Jito atomic bundle submission via Jito block engine.
 *
 * Endpoints:
 *   - Mainnet: https://mainnet.block-engine.jito.wtf/api/v1/bundles
 *   - Testnet: https://testnet.block-engine.jito.wtf/api/v1/bundles
 *   (Devnet doesn't have a Jito block engine — we fall back to sequential submission.)
 *
 * Bundle = up to 5 versioned transactions executed atomically. If any tx fails, the entire
 * bundle reverts. Includes a tip transfer to a Jito tip account.
 *
 * For Settle: bundle [revoke_ix, close_pact_ix, refund_spl_ix] so the user gets their
 * unspent funds back atomically with the revoke. No window where the card is revoked but
 * funds are still trapped.
 *
 * Tip accounts (Jito provides 8 rotating addresses; pick one randomly per bundle):
 *   https://docs.jito.wtf/lowlatencytxnsend/#tip-amount
 */

import {
  Connection,
  Transaction,
  VersionedTransaction,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import bs58 from "bs58";

export const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pivKeVQqoZjU2yFFf66r",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

export function pickTipAccount(): PublicKey {
  return new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]!);
}

function getJitoEndpoint(): string {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (cluster === "mainnet") return "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
  if (cluster === "testnet") return "https://testnet.block-engine.jito.wtf/api/v1/bundles";
  return ""; // devnet — no Jito
}

/**
 * Submit a bundle of signed transactions via Jito block engine.
 * Returns the bundle UUID (use to query status).
 *
 * Falls back to null if not on mainnet/testnet — caller should submit txs sequentially.
 */
export async function submitJitoBundle(signedTxs: Array<Transaction | VersionedTransaction>): Promise<string | null> {
  const endpoint = getJitoEndpoint();
  if (!endpoint) return null;

  const encoded = signedTxs.map((t) => {
    const raw =
      t instanceof VersionedTransaction
        ? t.serialize()
        : t.serialize({ requireAllSignatures: false, verifySignatures: false });
    return bs58.encode(raw);
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [encoded],
    }),
  });

  if (!res.ok) {
    throw new Error(`Jito bundle submit HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`Jito bundle error: ${json.error.message}`);
  return json.result ?? null;
}

/**
 * Build a tip-transfer instruction to send to a Jito tip account.
 * Required for Jito bundles to be considered for inclusion.
 */
export function buildJitoTipIx(params: {
  payer: PublicKey;
  lamports: number;
}) {
  return SystemProgram.transfer({
    fromPubkey: params.payer,
    toPubkey: pickTipAccount(),
    lamports: params.lamports,
  });
}

/**
 * Submit txs sequentially as a fallback when Jito is unavailable (devnet) or bundling fails.
 * Returns array of signatures in order.
 */
export async function submitSequentially(
  connection: Connection,
  signedTxs: Array<Transaction | VersionedTransaction>,
): Promise<string[]> {
  const sigs: string[] = [];
  for (const tx of signedTxs) {
    const raw =
      tx instanceof VersionedTransaction
        ? tx.serialize()
        : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const sig = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(sig, "confirmed");
    sigs.push(sig);
  }
  return sigs;
}
