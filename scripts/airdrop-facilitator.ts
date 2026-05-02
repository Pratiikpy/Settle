#!/usr/bin/env tsx
/**
 * One-shot devnet airdrop. Helius RPC rejects requestAirdrop, so we
 * use api.devnet.solana.com directly for the airdrop, then read balance
 * back via whatever RPC the env points to.
 */
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

async function main() {
  const target = process.argv[2] ?? "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY";
  const lamports = Number(process.argv[3] ?? "1000000000");

  const heliusKey = process.env.HELIUS_API_KEY;
  const rpc = heliusKey
    ? `https://devnet.helius-rpc.com/?api-key=${heliusKey}`
    : clusterApiUrl("devnet");
  const fallback = new Connection(clusterApiUrl("devnet"), "confirmed");
  const c = new Connection(rpc, "confirmed");
  const pk = new PublicKey(target);

  const before = await c.getBalance(pk, "confirmed");
  console.log(`target=${target}`);
  console.log(`balance before: ${before / 1e9} SOL`);
  try {
    const sig = await fallback.requestAirdrop(pk, lamports);
    console.log(`airdrop sig: ${sig}`);
    await fallback.confirmTransaction(sig, "confirmed");
    console.log("confirmed");
  } catch (e) {
    console.log(`airdrop error: ${(e as Error).message}`);
  }
  const after = await c.getBalance(pk, "confirmed");
  console.log(`balance after:  ${after / 1e9} SOL`);
}

void main();
