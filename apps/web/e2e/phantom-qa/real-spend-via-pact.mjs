#!/usr/bin/env node
/**
 * Real on-chain spend_via_pact PROOF — runtime confirmation Bug #26 is fixed.
 *
 * Three signed devnet txs:
 *   1. create_card    — A as authority+agent, allowlist=[R], cap=1 USDC
 *   2. open_pact       — under that card, vault funded with 0.05 USDC
 *   3. spend_via_pact  — A (as agent) → R, 0.02 USDC from the pact's vault
 *
 * Pre-fix Bug #26 made step 3 hit "Program failed to complete" inside
 * the BPF interpreter (stack overflow during account validation).
 * Post-fix (Box<Account> on the 5 large accounts) the validation
 * completes and the SPL transfer fires.
 *
 * If this script PASSES → runtime proof Bug #26 is fixed.
 * If step 3 logs include "Access violation" or "stack frame" → fix not live.
 */

import { readFileSync } from "fs";
import { randomUUID } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import {
  createCardIx,
  openPactIx,
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
console.log(`A (authority+agent): ${A.publicKey.toBase58()}`);
console.log(`R (recipient):       ${R.publicKey.toBase58()}\n`);

const connection = new Connection(RPC, { commitment: "confirmed" });

const stamp = Date.now().toString(36).slice(-6);
const cardLabel = `bug26-${stamp}`;
const cardLabelHash = labelHashBytes(cardLabel);
const [cardPda] = findAgentCardPda(A.publicKey, cardLabelHash);
const scopeLabel = `pact-${stamp}`;
const scopeHash = labelHashBytes(scopeLabel);
const [pactPda] = findPactPda(cardPda, scopeHash);
const [vaultPda] = findPactVaultPda(pactPda);
console.log(`card:  ${cardPda.toBase58()}`);
console.log(`pact:  ${pactPda.toBase58()}`);
console.log(`vault: ${vaultPda.toBase58()}\n`);

const currentSlot = BigInt(await connection.getSlot("confirmed"));
const expirySlot = currentSlot + 100_000n;
console.log(`current slot: ${currentSlot} | expiry: ${expirySlot}\n`);

async function send(tx, label) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = A.publicKey;
  tx.sign(A);
  try {
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    console.log(`${label} sig: ${sig}`);
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`  CONFIRMED — https://solscan.io/tx/${sig}?cluster=devnet`);
    return sig;
  } catch (e) {
    console.error(`  ${label} FAILED: ${e.message}`);
    if (e.logs) console.error("  logs:\n   ", e.logs.join("\n    "));
    throw e;
  }
}

// ─── STEP 1: create_card ───
console.log("=== STEP 1: create_card ===");
const createIx = createCardIx({
  authority: A.publicKey,
  card: cardPda,
  usdcMint: USDC_MINT,
  args: {
    agentPubkey: A.publicKey,                   // self-as-agent
    labelHash: cardLabelHash,
    dailyCapLamports: 1_000_000n,               // 1 USDC daily
    perCallMaxLamports: 500_000n,               // 0.5 USDC per call
    allowlist: [
      { merchant: R.publicKey, capabilityHash: null },
    ],
    expirySlot,
    policyVersion: 1,
  },
});
await send(new Transaction().add(createIx), "create_card");

// ─── STEP 2: open_pact (funds the vault) ───
console.log("\n=== STEP 2: open_pact ===");
const openIx = openPactIx({
  authority: A.publicKey,
  parentCard: cardPda,
  pact: pactPda,
  usdcMint: USDC_MINT,
  args: {
    scopeLabelHash: scopeHash,
    capLamports: 50_000n,                       // 0.05 USDC vault
    allowlist: [
      { merchant: R.publicKey, capabilityHash: null },
    ],
    expirySlot,
  },
});
await send(new Transaction().add(openIx), "open_pact");

// confirm vault funded
const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);
const vaultAcc = await getAccount(connection, vaultUsdc);
console.log(`  vault balance: ${(Number(vaultAcc.amount) / 1e6).toFixed(6)} USDC`);

// ─── STEP 2.5: pre-create R's USDC ATA (program errors if missing) ───
const recvAta = await getAssociatedTokenAddress(USDC_MINT, R.publicKey);
const ataIx = createAssociatedTokenAccountInstruction(
  A.publicKey, recvAta, R.publicKey, USDC_MINT,
);
console.log("\n=== STEP 2.5: create R's USDC ATA ===");
await send(new Transaction().add(ataIx), "create_ata");

// ─── STEP 3: spend_via_pact — THE Bug #26 PROOF ───
console.log("\n=== STEP 3: spend_via_pact (Bug #26 runtime proof) ===");
const decisionSlot = await connection.getSlot("confirmed");
const requestId = randomUUID();
const commit = kernelCommit({
  kind: "direct_send",
  request_id: requestId,
  amount_lamports: "20000",
  sender: A.publicKey.toBase58(),
  recipient: R.publicKey.toBase58(),
  decision_slot: decisionSlot,
  purpose_text: `bug26 runtime proof ${stamp}`,
});
const spendIx = spendViaPactIxWithAtas({
  agent: A.publicKey,
  feePayer: A.publicKey,
  card: cardPda,
  pact: pactPda,
  usdcMint: USDC_MINT,
  args: {
    amount: 20_000n,                            // 0.02 USDC
    merchantOwner: R.publicKey,
    capabilityHash: new Uint8Array(32),
    receiptHash: hexToBytes(commit.hashes.receipt_hash),
    reasonHash: hexToBytes(commit.hashes.reason_hash),
    policySnapshotHash: hexToBytes(commit.hashes.policy_snapshot_hash),
  },
});
const sig = await send(new Transaction().add(spendIx), "spend_via_pact");

// confirm R received
const recvAcc = await getAccount(connection, recvAta);
console.log(`\n  R received: ${(Number(recvAcc.amount) / 1e6).toFixed(6)} USDC`);
if (recvAcc.amount !== 20_000n) {
  console.error(`FAIL: expected 20000 atomic, got ${recvAcc.amount}`);
  process.exit(1);
}

console.log(`\nPASS — Bug #26 runtime-fixed; spend_via_pact landed end-to-end on devnet`);
console.log(`  spend_via_pact sig: ${sig}`);
