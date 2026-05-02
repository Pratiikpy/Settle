#!/usr/bin/env tsx
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const heliusKey = process.env.HELIUS_API_KEY;
const rpc = heliusKey
  ? `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`
  : `https://api.${cluster}.solana.com`;
const conn = new Connection(rpc, "confirmed");

const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const WALLET_PATH = resolve(process.cwd(), ".test-wallet.json");

async function main() {
  if (!existsSync(WALLET_PATH)) {
    console.error("Run scripts/bootstrap-test-wallet.ts first");
    process.exit(1);
  }
  const kp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(WALLET_PATH, "utf8")) as number[]),
  );
  const sol = await conn.getBalance(kp.publicKey, "confirmed");
  const ata = await getAssociatedTokenAddress(usdcMint, kp.publicKey);
  let usdc = "no ATA";
  try {
    const info = await conn.getTokenAccountBalance(ata, "confirmed");
    usdc = `${info.value.uiAmountString} USDC`;
  } catch {
    /* none */
  }
  console.log(`Test wallet:  ${kp.publicKey.toBase58()}`);
  console.log(`SOL:          ${(sol / LAMPORTS_PER_SOL).toFixed(3)}`);
  console.log(`USDC:         ${usdc}`);
  console.log(`USDC ATA:     ${ata.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
