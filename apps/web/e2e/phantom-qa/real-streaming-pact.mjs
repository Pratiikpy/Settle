#!/usr/bin/env node
/**
 * Real on-chain streaming Pact lifecycle.
 *
 * Tests the *other* Box-fixed ix family from Bug #26: claim_streaming
 * (sibling of spend_via_pact, same 5 boxed accounts in claim_streaming.rs).
 *
 * Flow:
 *   1. create_card           A authority+agent
 *   2. open_streaming_pact   rate=1000 lamports/slot, max=0.10 USDC
 *   3. create R's ATA
 *   4. wait some slots
 *   5. claim_streaming       agent A draws accrued entitlement → R
 *
 * If claim_streaming lands successfully, this is the *second* runtime
 * proof Bug #26 is fixed (claim_streaming.rs has the same Box<Account>
 * applied to its 5 large accounts).
 */

import { readFileSync } from "fs";
import { randomUUID } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  createCardIx,
  openStreamingPactIx,
  claimStreamingIxWithAtas,
  labelHashBytes,
  findAgentCardPda,
  findPactPda,
  findPactVaultPda,
} from "../../lib/anchor-client";
import { kernelCommit, hexToBytes } from "@settle/sdk";

const ID_JSON = process.platform === "win32"
  ? "C:\\Users\\prate\\.config\\solana\\id.json"
  : "/mnt/c/Users/prate/.config/solana/id.json";
const RPC = "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const A = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(ID_JSON, "utf8"))));
const R = Keypair.generate();
console.log(`A: ${A.publicKey.toBase58()}`);
console.log(`R: ${R.publicKey.toBase58()}\n`);

const connection = new Connection(RPC, { commitment: "confirmed" });
const stamp = Date.now().toString(36).slice(-6);
const cardLabelHash = labelHashBytes(`stream-${stamp}`);
const [cardPda] = findAgentCardPda(A.publicKey, cardLabelHash);
const scopeHash = labelHashBytes(`stream-pact-${stamp}`);
const [pactPda] = findPactPda(cardPda, scopeHash);
const [vaultPda] = findPactVaultPda(pactPda);
const startSlot = BigInt(await connection.getSlot("confirmed"));
const expirySlot = startSlot + 100_000n;

const rAta = await getAssociatedTokenAddress(USDC_MINT, R.publicKey);
const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);

async function send(tx, label) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = A.publicKey;
  tx.sign(A);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log(`  ${label}: ${sig}`);
  return sig;
}

console.log("=== STEP 1: create_card ===");
await send(new Transaction().add(createCardIx({
  authority: A.publicKey, card: cardPda, usdcMint: USDC_MINT,
  args: {
    agentPubkey: A.publicKey, labelHash: cardLabelHash,
    dailyCapLamports: 1_000_000n, perCallMaxLamports: 100_000n,
    allowlist: [{ merchant: R.publicKey, capabilityHash: null }],
    expirySlot, policyVersion: 1,
  },
})), "create_card");

console.log("\n=== STEP 2: open_streaming_pact (1000 lamports/slot, max 0.10 USDC) ===");
await send(new Transaction().add(openStreamingPactIx({
  authority: A.publicKey, parentCard: cardPda, pact: pactPda, usdcMint: USDC_MINT,
  args: {
    scopeLabelHash: scopeHash,
    rateLamportsPerSlot: 1000n,
    maxTotalLamports: 100_000n,
    allowlist: [{ merchant: R.publicKey, capabilityHash: null }],
    expirySlot,
  },
})), "open_streaming_pact");
const vaultBefore = await getAccount(connection, vaultUsdc);
console.log(`  vault funded: ${(Number(vaultBefore.amount) / 1e6).toFixed(6)} USDC`);

console.log("\n=== STEP 3: create R's ATA ===");
await send(new Transaction().add(
  createAssociatedTokenAccountInstruction(A.publicKey, rAta, R.publicKey, USDC_MINT),
), "create_ata");

console.log("\n=== STEP 4: wait for slots to accrue ===");
await new Promise((r) => setTimeout(r, 6_000));
const claimSlot = await connection.getSlot("confirmed");
const slotDelta = claimSlot - Number(startSlot);
console.log(`  ${slotDelta} slots accrued (≈${(slotDelta * 1000 / 1e6).toFixed(6)} USDC entitled)`);

console.log("\n=== STEP 5: claim_streaming ===");
const claimAmount = BigInt(slotDelta * 1000); // matches rate*slots
const commit = kernelCommit({
  kind: "streaming_claim",
  request_id: randomUUID(),
  amount_lamports: claimAmount.toString(),
  sender: A.publicKey.toBase58(),
  recipient: R.publicKey.toBase58(),
  decision_slot: claimSlot,
  purpose_text: `streaming claim ${stamp}`,
  card_pubkey: cardPda.toBase58(),
  pact_pubkey: pactPda.toBase58(),
  capability_hash: "00".repeat(32),
  policy_version: 1,
  daily_cap_lamports: "1000000",
  per_call_max_lamports: "100000",
  allowlist_count: 1,
  expiry_slot: Number(expirySlot),
  revoked: false,
  cap_remaining_after: "1000000",
  billable_slots: slotDelta,
});
try {
  await send(new Transaction().add(claimStreamingIxWithAtas({
    agent: A.publicKey,
    feePayer: A.publicKey,
    card: cardPda,
    pact: pactPda,
    usdcMint: USDC_MINT,
    args: {
      merchantOwner: R.publicKey,
      capabilityHash: new Uint8Array(32),
      receiptHash: hexToBytes(commit.hashes.receipt_hash),
      reasonHash: hexToBytes(commit.hashes.reason_hash),
      policySnapshotHash: hexToBytes(commit.hashes.policy_snapshot_hash),
    },
  })), "claim_streaming");
  const recv = await getAccount(connection, rAta);
  console.log(`\n  R received: ${(Number(recv.amount) / 1e6).toFixed(6)} USDC`);
  console.log("\nPASS — claim_streaming runtime-fixed; streaming Pact lifecycle complete on-chain");
} catch (e) {
  console.error(`\nclaim_streaming FAILED: ${e.message}`);
  if (e.transactionLogs) console.error("logs:\n  " + e.transactionLogs.join("\n  "));
  process.exit(1);
}
