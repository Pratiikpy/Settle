#!/usr/bin/env tsx
/**
 * Transfer SOL from test-wallet (authority) to a target wallet —
 * used to top up facilitator/relayer when devnet faucet rate-limits.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import bs58 from "bs58";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const fromPath = process.env.SETTLE_TEST_WALLET_PATH ?? ".test-wallet.json";
  const target = process.argv[2];
  const sol = Number(process.argv[3] ?? "0.1");
  if (!target) {
    console.error("usage: transfer-sol.ts <target_pubkey> [sol_amount]");
    process.exit(1);
  }

  const heliusKey = process.env.HELIUS_API_KEY;
  const rpc = heliusKey
    ? `https://devnet.helius-rpc.com/?api-key=${heliusKey}`
    : clusterApiUrl("devnet");
  const c = new Connection(rpc, "confirmed");

  const path = resolve(process.cwd(), fromPath);
  if (!existsSync(path)) throw new Error(`No keypair at ${path}`);
  const from = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
  const to = new PublicKey(target);

  const lamports = Math.round(sol * 1e9);
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }),
  );
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = from.publicKey;
  tx.sign(from);

  const sig = await c.sendRawTransaction(tx.serialize(), {
    preflightCommitment: "confirmed",
  });
  console.log(`sig: ${sig}`);
  await c.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

  const fromBal = await c.getBalance(from.publicKey, "confirmed");
  const toBal = await c.getBalance(to, "confirmed");
  console.log(`from (${from.publicKey.toBase58()}): ${fromBal / 1e9} SOL`);
  console.log(`to   (${to.toBase58()}): ${toBal / 1e9} SOL`);
}

void main();
