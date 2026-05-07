#!/usr/bin/env node
/**
 * Full Pact lifecycle on-chain proof: open → spend → close → drain.
 *
 * Closes the protocol-level "Pact mode" story end-to-end:
 *   1. create_card    A authority+agent
 *   2. open_pact      vault funded 0.10 USDC
 *   3. create R's ATA
 *   4. spend_via_pact 0.03 USDC → R (vault now 0.07 USDC)
 *   5. close_pact     drain remaining 0.07 USDC back to A
 *
 * Confirms vault balance flow:  0 → 0.10 → 0.07 → 0
 * Confirms A balance flow:      X → X-0.10 → X-0.10 → X-0.03
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
  openPactIx,
  closePactIx,
  spendViaPactIxWithAtas,
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
const cardLabelHash = labelHashBytes(`lc-${stamp}`);
const [cardPda] = findAgentCardPda(A.publicKey, cardLabelHash);
const scopeHash = labelHashBytes(`lc-pact-${stamp}`);
const [pactPda] = findPactPda(cardPda, scopeHash);
const [vaultPda] = findPactVaultPda(pactPda);
const expirySlot = BigInt(await connection.getSlot("confirmed")) + 100_000n;

const aAta = await getAssociatedTokenAddress(USDC_MINT, A.publicKey);
const rAta = await getAssociatedTokenAddress(USDC_MINT, R.publicKey);
const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);

async function balance(ata) {
  try { const acc = await getAccount(connection, ata); return Number(acc.amount); }
  catch { return 0; }
}

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

const aBefore = await balance(aAta);
console.log(`A USDC before: ${(aBefore / 1e6).toFixed(2)}\n`);

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

console.log("\n=== STEP 2: open_pact (vault = 0.10 USDC) ===");
await send(new Transaction().add(openPactIx({
  authority: A.publicKey, parentCard: cardPda, pact: pactPda, usdcMint: USDC_MINT,
  args: {
    scopeLabelHash: scopeHash, capLamports: 100_000n,
    allowlist: [{ merchant: R.publicKey, capabilityHash: null }],
    expirySlot,
  },
})), "open_pact");
console.log(`  vault now: ${(await balance(vaultUsdc) / 1e6).toFixed(6)} USDC`);

console.log("\n=== STEP 3: create R's ATA ===");
await send(new Transaction().add(
  createAssociatedTokenAccountInstruction(A.publicKey, rAta, R.publicKey, USDC_MINT),
), "create_ata");

console.log("\n=== STEP 4: spend 0.03 USDC ===");
const commit = kernelCommit({
  kind: "direct_send", request_id: randomUUID(), amount_lamports: "30000",
  sender: A.publicKey.toBase58(), recipient: R.publicKey.toBase58(),
  decision_slot: 1, purpose_text: `lc-${stamp}`,
});
await send(new Transaction().add(spendViaPactIxWithAtas({
  agent: A.publicKey, feePayer: A.publicKey, card: cardPda, pact: pactPda, usdcMint: USDC_MINT,
  args: {
    amount: 30_000n, merchantOwner: R.publicKey,
    capabilityHash: new Uint8Array(32),
    receiptHash: hexToBytes(commit.hashes.receipt_hash),
    reasonHash: hexToBytes(commit.hashes.reason_hash),
    policySnapshotHash: hexToBytes(commit.hashes.policy_snapshot_hash),
  },
})), "spend_via_pact");
console.log(`  vault now: ${(await balance(vaultUsdc) / 1e6).toFixed(6)} USDC`);
console.log(`  R received: ${(await balance(rAta) / 1e6).toFixed(6)} USDC`);

console.log("\n=== STEP 5: close_pact (drain remainder back to A) ===");
const aBeforeClose = await balance(aAta);
await send(new Transaction().add(closePactIx({
  authority: A.publicKey, pact: pactPda, usdcMint: USDC_MINT,
})), "close_pact");
const vaultAfter = await balance(vaultUsdc);
const aAfterClose = await balance(aAta);
console.log(`  vault now: ${(vaultAfter / 1e6).toFixed(6)} USDC (expected 0)`);
console.log(`  A balance change from close: +${((aAfterClose - aBeforeClose) / 1e6).toFixed(6)} USDC (expected +0.07)`);

const refund = aAfterClose - aBeforeClose;
const ok = vaultAfter === 0 && refund === 70_000;
console.log(`\n${ok ? "PASS" : "FAIL"} — full Pact lifecycle (open → spend → close → drain) on-chain`);
process.exit(ok ? 0 : 1);
