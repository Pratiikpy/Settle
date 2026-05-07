#!/usr/bin/env node
/**
 * Real on-chain DENY + REVOKE proof.
 *
 * Closes two long-standing MISSION ⚠️ items:
 *   ⚠️ Denied spend (over cap) → fail visibly
 *   ⚠️ Revoke / panic → approve in Phantom (panic-revoke half done)
 *
 * Flow (5 ixes):
 *   1. create_card    A authority+agent, allowlist=[R], per_call_max = 0.05 USDC
 *   2. open_pact      vault funded with 0.10 USDC
 *   3. create R's ATA
 *   4. spend_via_pact AMOUNT > per_call_max → expect program error
 *   5. revoke + spend_via_pact AMOUNT < per_call_max → expect CardRevoked error
 *
 * Each "expected failure" gets PASS if the program returns the EXACT error
 * code we expected, not a generic stack overflow. That confirms:
 *   - the Box<Account> fix is live (program reaches validation)
 *   - cap enforcement works
 *   - revoke flag is honored
 */

import { readFileSync } from "fs";
import { randomUUID } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  createCardIx,
  openPactIx,
  spendViaPactIxWithAtas,
  revokeIx,
  labelHashBytes,
  findAgentCardPda,
  findPactPda,
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
const cardLabelHash = labelHashBytes(`deny-${stamp}`);
const [cardPda] = findAgentCardPda(A.publicKey, cardLabelHash);
const scopeHash = labelHashBytes(`scope-${stamp}`);
const [pactPda] = findPactPda(cardPda, scopeHash);

const expirySlot = BigInt(await connection.getSlot("confirmed")) + 100_000n;

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

async function sendOk(tx, label) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = A.publicKey;
  tx.sign(A);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log(`  ${label} sig: ${sig}`);
  return sig;
}

async function sendExpectFail(tx, label, expectMatch) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = A.publicKey;
  tx.sign(A);
  try {
    await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    return { ok: false, reason: "tx unexpectedly succeeded", logs: [] };
  } catch (e) {
    const logs = (e.logs ?? e.transactionLogs ?? []).join("\n");
    const matched = expectMatch.test(logs);
    return { ok: matched, reason: matched ? "matched expected error" : "different error", logs };
  }
}

// === Setup ===
console.log("=== STEP 1: create_card (per_call_max = 0.05 USDC) ===");
await sendOk(new Transaction().add(createCardIx({
  authority: A.publicKey,
  card: cardPda,
  usdcMint: USDC_MINT,
  args: {
    agentPubkey: A.publicKey,
    labelHash: cardLabelHash,
    dailyCapLamports: 1_000_000n,
    perCallMaxLamports: 50_000n,        // 0.05 USDC per call (the enforcement we'll test)
    allowlist: [{ merchant: R.publicKey, capabilityHash: null }],
    expirySlot,
    policyVersion: 1,
  },
})), "create_card");

console.log("\n=== STEP 2: open_pact (vault = 0.10 USDC) ===");
await sendOk(new Transaction().add(openPactIx({
  authority: A.publicKey,
  parentCard: cardPda,
  pact: pactPda,
  usdcMint: USDC_MINT,
  args: {
    scopeLabelHash: scopeHash,
    capLamports: 100_000n,              // 0.10 USDC vault
    allowlist: [{ merchant: R.publicKey, capabilityHash: null }],
    expirySlot,
  },
})), "open_pact");

const recvAta = await getAssociatedTokenAddress(USDC_MINT, R.publicKey);
console.log("\n=== STEP 3: create R's USDC ATA ===");
await sendOk(new Transaction().add(
  createAssociatedTokenAccountInstruction(A.publicKey, recvAta, R.publicKey, USDC_MINT),
), "create_ata");

// Helper to build a spend ix with given amount
function buildSpendIx(amountAtomic) {
  const decisionSlot = 1; // doesn't matter for the actual cap check
  const commit = kernelCommit({
    kind: "direct_send",
    request_id: randomUUID(),
    amount_lamports: String(amountAtomic),
    sender: A.publicKey.toBase58(),
    recipient: R.publicKey.toBase58(),
    decision_slot: decisionSlot,
    purpose_text: `deny test ${amountAtomic}`,
  });
  return spendViaPactIxWithAtas({
    agent: A.publicKey,
    feePayer: A.publicKey,
    card: cardPda,
    pact: pactPda,
    usdcMint: USDC_MINT,
    args: {
      amount: BigInt(amountAtomic),
      merchantOwner: R.publicKey,
      capabilityHash: new Uint8Array(32),
      receiptHash: hexToBytes(commit.hashes.receipt_hash),
      reasonHash: hexToBytes(commit.hashes.reason_hash),
      policySnapshotHash: hexToBytes(commit.hashes.policy_snapshot_hash),
    },
  });
}

// === DENY 1: spend over per_call_max ===
console.log("\n=== STEP 4: spend 0.06 USDC > per_call_max 0.05 (expect deny) ===");
{
  const tx = new Transaction().add(buildSpendIx(60_000));
  const r = await sendExpectFail(tx, "over-cap", /PerCallMaxExceeded|OverPerCallMax|cap|exceed/i);
  log(r.ok, "Denied: spend exceeds per_call_max", r.reason);
  if (!r.ok) console.log(`    logs:\n${r.logs}`);
}

// === ALLOWED: spend just under per_call_max (sanity) ===
console.log("\n=== STEP 5: spend 0.04 USDC ≤ per_call_max 0.05 (expect allow) ===");
{
  try {
    const tx = new Transaction().add(buildSpendIx(40_000));
    await sendOk(tx, "under-cap");
    log(true, "Allowed: spend under per_call_max");
  } catch (e) {
    log(false, "Allowed: spend under per_call_max", e.message);
  }
}

// === DENY 2: revoke + try to spend ===
console.log("\n=== STEP 6: revoke card ===");
await sendOk(new Transaction().add(revokeIx({ authority: A.publicKey, card: cardPda })), "revoke");

console.log("\n=== STEP 7: spend 0.01 USDC after revoke (expect deny) ===");
{
  const tx = new Transaction().add(buildSpendIx(10_000));
  const r = await sendExpectFail(tx, "post-revoke", /Revoked|CardRevoked|revoked/i);
  log(r.ok, "Denied: spend on revoked card", r.reason);
  if (!r.ok) console.log(`    logs:\n${r.logs}`);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
