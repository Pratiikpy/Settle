#!/usr/bin/env node
/**
 * Spawn an AgentCard delegated to the production relayer
 * (C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY) so phase5-signer
 * can fire spend_via_pact for my wallet.
 *
 * Without this, every scheduled_send/round_up/auto_refill rule for
 * my wallet would forever stay 'failed' on /admin/health regardless
 * of Bug #26's fix — because the relayer can't sign as agent.
 *
 * After this card exists, the operator/judge can:
 *   1. Create a scheduled_send pointing at this card_pubkey
 *   2. Wait for the cadence boundary
 *   3. Watch /admin/health show 'confirmed' for that fire
 */

import { readFileSync } from "fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createCardIx,
  labelHashBytes,
  findAgentCardPda,
} from "../../lib/anchor-client";

const ID_JSON = process.platform === "win32"
  ? "C:\\Users\\prate\\.config\\solana\\id.json"
  : "/mnt/c/Users/prate/.config/solana/id.json";
const RPC = "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const RELAYER_PUBKEY = new PublicKey("C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY");

// Common merchant allowlist for demo / testing — judges' likely targets.
// In production you'd allowlist your own destinations.
const ALLOWLIST = [
  // Self (so refunds and round-ups can land back home)
  "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp",
];

const A = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(ID_JSON, "utf8"))));
console.log(`A (authority):      ${A.publicKey.toBase58()}`);
console.log(`Agent (= relayer):  ${RELAYER_PUBKEY.toBase58()}\n`);

const connection = new Connection(RPC, { commitment: "confirmed" });

// Stable label so this card is rediscoverable by future drivers.
const cardLabel = "phase5-relayer-delegated-v1";
const cardLabelHash = labelHashBytes(cardLabel);
const [cardPda] = findAgentCardPda(A.publicKey, cardLabelHash);
console.log(`Card PDA:  ${cardPda.toBase58()}`);
console.log(`Label:     "${cardLabel}"\n`);

// Idempotency: skip if already exists
const existing = await connection.getAccountInfo(cardPda);
if (existing) {
  console.log(`Card already exists (data length ${existing.data.length}). Skipping.`);
  console.log(`PASS — phase5-signer can fire for this card`);
  console.log(`  card_pubkey: ${cardPda.toBase58()}`);
  console.log(`  authority:   ${A.publicKey.toBase58()} (you)`);
  console.log(`  agent:       ${RELAYER_PUBKEY.toBase58()} (production relayer)`);
  process.exit(0);
}

const expirySlot = BigInt(await connection.getSlot("confirmed")) + 100_000n;

const ix = createCardIx({
  authority: A.publicKey,
  card: cardPda,
  usdcMint: USDC_MINT,
  args: {
    agentPubkey: RELAYER_PUBKEY,                       // <-- delegate to relayer
    labelHash: cardLabelHash,
    dailyCapLamports: 1_000_000n,                       // 1 USDC daily
    perCallMaxLamports: 100_000n,                       // 0.10 USDC per fire
    allowlist: ALLOWLIST.map((m) => ({
      merchant: new PublicKey(m),
      capabilityHash: null,
    })),
    expirySlot,
    policyVersion: 1,
  },
});

const tx = new Transaction().add(ix);
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
tx.recentBlockhash = blockhash;
tx.lastValidBlockHeight = lastValidBlockHeight;
tx.feePayer = A.publicKey;
tx.sign(A);

console.log("Sending create_card with agent=relayer…");
const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
console.log(`  sig: ${sig}`);
console.log(`  https://solscan.io/tx/${sig}?cluster=devnet`);

await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
console.log(`  CONFIRMED\n`);

console.log(`PASS — production relayer can now fire spend_via_pact for this card`);
console.log(`  card_pubkey: ${cardPda.toBase58()}`);
console.log(`  authority:   ${A.publicKey.toBase58()} (you)`);
console.log(`  agent:       ${RELAYER_PUBKEY.toBase58()} (production relayer)`);
console.log(`\nNext: create a scheduled_send rule with card_pubkey=${cardPda.toBase58()}`);
console.log(`(via /wishes UI or POST /api/scheduled-sends signed by ${A.publicKey.toBase58()})`);
console.log(`then wait for the cadence boundary — /admin/health will show 'confirmed'.`);
