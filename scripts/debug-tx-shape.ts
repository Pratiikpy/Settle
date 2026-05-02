#!/usr/bin/env tsx
import { Connection, clusterApiUrl } from "@solana/web3.js";

async function main() {
  const sig = process.argv[2] ??
    "4tTsRAG23my5w7JAoDNLwtL8LWy47Hih5vpWHuajohvhXSUDkAcnn7P4uMCnvZgEgcmRrA6WWC4UXJjPyD2aTwCs";
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const rpc = process.env.HELIUS_API_KEY
    ? `https://${cluster}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
  const conn = new Connection(rpc, "confirmed");
  const tx = await conn.getParsedTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  console.log("=== top-level instructions ===");
  console.log(JSON.stringify(tx?.transaction.message.instructions, null, 2).slice(0, 5000));
  console.log("\n=== inner instructions ===");
  console.log(JSON.stringify(tx?.meta?.innerInstructions, null, 2).slice(0, 5000));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
