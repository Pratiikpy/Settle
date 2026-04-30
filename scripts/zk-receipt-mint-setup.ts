#!/usr/bin/env tsx
/**
 * zk-receipt-mint-setup — one-time creates the Settle Receipt compressed mint
 * (decimals=0) using the legacy @lightprotocol/compressed-token API. Run this
 * once per cluster.
 *
 * Required env (load via dotenv from the project root):
 *   SETTLE_ZK_RECEIPT_AUTHORITY_PRIVKEY  base58 64-byte secret (from zk:keygen)
 *   NEXT_PUBLIC_RPC_URL or HELIUS_API_KEY (must point at a ZK-Compression-aware
 *                                         endpoint — Helius works on devnet/mainnet)
 *   SETTLE_CLUSTER  devnet | mainnet (default devnet)
 *
 * Usage:
 *   pnpm zk:mint-setup
 *   # prints SETTLE_ZK_RECEIPT_MINT=<pubkey> — copy into .env.local
 */

import { config } from "dotenv";
import { Keypair, clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import { createRpc } from "@lightprotocol/stateless.js";
import { createMint } from "@lightprotocol/compressed-token";

config();

const CLUSTER = (process.env.SETTLE_CLUSTER ?? "devnet") as "devnet" | "mainnet";

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL ?? process.env.RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) {
    return `https://${CLUSTER}.helius-rpc.com/?api-key=${heliusKey}`;
  }
  return clusterApiUrl(CLUSTER === "mainnet" ? "mainnet-beta" : "devnet");
}

(async () => {
  const privBase58 = process.env.SETTLE_ZK_RECEIPT_AUTHORITY_PRIVKEY;
  if (!privBase58) {
    console.error(
      "[zk:mint-setup] SETTLE_ZK_RECEIPT_AUTHORITY_PRIVKEY missing. Run `pnpm zk:keygen` first.",
    );
    process.exit(1);
  }
  const secret = bs58.decode(privBase58);
  if (secret.length !== 64) {
    console.error(
      `[zk:mint-setup] SETTLE_ZK_RECEIPT_AUTHORITY_PRIVKEY must be 64 bytes (got ${secret.length})`,
    );
    process.exit(1);
  }
  const payer = Keypair.fromSecretKey(secret);

  const rpcUrl = getRpcUrl();
  console.log(`[zk:mint-setup] cluster=${CLUSTER} rpc=${rpcUrl}`);
  console.log(`[zk:mint-setup] authority=${payer.publicKey.toBase58()}`);

  const rpc = createRpc(rpcUrl, rpcUrl, rpcUrl);
  // decimals=0 — receipts are unit counts, not divisible amounts.
  const { mint, transactionSignature } = await createMint(rpc, payer, payer.publicKey, 0);

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(" Settle Receipt compressed mint created");
  console.log("══════════════════════════════════════════════════════════════════\n");
  console.log(`Mint pubkey: ${mint.toBase58()}`);
  console.log(`Tx sig     : ${transactionSignature}`);
  console.log(
    `Solscan    : https://solscan.io/tx/${transactionSignature}?cluster=${CLUSTER}\n`,
  );
  console.log("Add to .env.local:");
  console.log(`SETTLE_ZK_RECEIPT_MINT=${mint.toBase58()}\n`);
  console.log("The compress-cron will use this mint to issue 1-unit receipts to buyers.");
})().catch((err) => {
  console.error("[zk:mint-setup] failed:", err);
  process.exit(1);
});
