#!/usr/bin/env tsx
/**
 * Path A smoke test: invoke `record_receipt` on devnet and read the emitted
 * ReceiptRecordedEvent log. Proves the v0.4 deploy is wired up end-to-end.
 */
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import {
  kernelCommit,
  kernelCommitToRecordReceiptArgs,
} from "../packages/sdk/dist/index.js";
import { recordReceiptIx } from "../apps/web/lib/anchor-client";

const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const rpc = process.env.HELIUS_API_KEY
  ? `https://${cluster}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : `https://api.${cluster}.solana.com`;
const conn = new Connection(rpc, "confirmed");

async function main() {
  const facilitator = Keypair.fromSecretKey(
    bs58.decode(process.env.SETTLE_FACILITATOR_PRIVKEY!),
  );
  const result = kernelCommit({
    kind: "direct_send",
    request_id: "11111111-2222-3333-4444-555555555555",
    amount_lamports: "500000",
    sender: facilitator.publicKey.toBase58(),
    recipient: facilitator.publicKey.toBase58(),
    decision_slot: await conn.getSlot("confirmed"),
    purpose_text: "smoke test: F2.0 Path A on-chain attestation",
  });
  const args = kernelCommitToRecordReceiptArgs(result);
  console.log("kernel commit:");
  console.log(`  receipt_hash: ${result.hashes.receipt_hash}`);
  console.log(`  context_hash: ${result.context_hash}`);

  const ix = recordReceiptIx({ attestor: facilitator.publicKey, args });
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = facilitator.publicKey;
  tx.sign(facilitator);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log(`\nsubmitted: ${sig}`);
  console.log(`solscan:   https://solscan.io/tx/${sig}?cluster=${cluster}`);

  const tx2 = await conn.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const logs = tx2?.meta?.logMessages ?? [];
  console.log("\nProgram logs (filtered):");
  for (const l of logs) {
    if (/RecordReceipt|Program data:|Program log:/.test(l)) console.log(`  ${l}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
