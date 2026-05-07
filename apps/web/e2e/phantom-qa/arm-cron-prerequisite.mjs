#!/usr/bin/env node
/**
 * Set up every prerequisite gate so the production cron can fire
 * `spend_via_pact` for B4cArR1M's wallet. This is the final actionable
 * step before the natural cron cadence completes Bug #26's
 * production-observability chain.
 *
 * Flow:
 *   1. Confirm delegated card EeFF9FZW…Qr4X exists on-chain (idempotent)
 *   2. POST /api/scheduled-sends with signed wallet-auth, pointing at
 *      the delegated card. Cadence DAILY, cap 0.05 USDC.
 *   3. POST /api/scheduled-sends/spawn-pact to get an unsigned open_pact
 *      tx, sign it locally with id.json, broadcast.
 *   4. POST /api/scheduled-sends/attach-pact to bind the new Pact to
 *      the schedule.
 *
 * After this driver, the prereq chain is:
 *   ✓ binary fixed + deployed
 *   ✓ relayer keypair + LIVE=true
 *   ✓ card delegated to relayer
 *   ✓ scheduled_send rule pointing at delegated card
 *   ✓ Pact spawned + funded under that schedule
 *   ⏳ phase5-tick needs to advance last_fired_at on cadence boundary
 *   ⏳ phase5-signer needs to pick it up and fire spend_via_pact
 *   ⏳ /admin/health shows 'confirmed' for that fire
 *
 * The remaining 3 gates are time-only.
 */

import { readFileSync } from "fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { randomBytes } from "crypto";

const PRODUCTION = "https://use-settle.vercel.app";
const ID_JSON = process.platform === "win32"
  ? "C:\\Users\\prate\\.config\\solana\\id.json"
  : "/mnt/c/Users/prate/.config/solana/id.json";
const RPC = "https://api.devnet.solana.com";
const DELEGATED_CARD = "EeFF9FZW2VCfuXdQxjV1Jt6Cjp1NitG6UNpW7zf1Qr4X";

const A = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(ID_JSON, "utf8"))));
const Apk = A.publicKey.toBase58();
const connection = new Connection(RPC, { commitment: "confirmed" });

function signAuth() {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const msg = `Settle Auth\nnonce=${nonce}\nts=${ts}\npubkey=${Apk}`;
  const sig = ed25519.sign(Buffer.from(msg, "utf8"), A.secretKey.slice(0, 32));
  return {
    "x-settle-auth-pubkey": Apk,
    "x-settle-auth-sig": bs58.encode(sig),
    "x-settle-auth-nonce": nonce,
    "x-settle-auth-ts": String(ts),
  };
}

console.log(`A: ${Apk}\n`);

// 1. Confirm delegated card on-chain
const cardInfo = await connection.getAccountInfo(new PublicKey(DELEGATED_CARD));
if (!cardInfo) {
  console.error(`FAIL: delegated card ${DELEGATED_CARD} doesn't exist on-chain. Run delegate-card-to-relayer.mjs first.`);
  process.exit(1);
}
console.log(`✓ Delegated card on-chain: ${DELEGATED_CARD} (${cardInfo.data.length} bytes)`);

// 2. Create scheduled_send rule pointing at delegated card
//    Pick a time_of_day a few minutes from now so phase5-tick picks it up soon.
const now = new Date();
const fireMinutes = (now.getUTCMinutes() + 3) % 60;  // 3 min from now
const fireHours = (now.getUTCHours() + Math.floor((now.getUTCMinutes() + 3) / 60)) % 24;
const time_of_day = `${String(fireHours).padStart(2, "0")}:${String(fireMinutes).padStart(2, "0")}`;

const r2 = await fetch(`${PRODUCTION}/api/scheduled-sends`, {
  method: "POST",
  headers: { "content-type": "application/json", ...signAuth() },
  body: JSON.stringify({
    owner_pubkey: Apk,
    card_pubkey: DELEGATED_CARD,
    dest_pubkey: Apk,                    // self-send (round-trip allowed by allowlist)
    amount_lamports: "10000",            // 0.01 USDC
    cadence: "DAILY",
    time_of_day,
    note: `bug26-cron-test-${Date.now()}`,
  }),
});
const j2 = await r2.json();
if (!r2.ok) {
  console.error(`FAIL: scheduled_send create — ${r2.status} ${JSON.stringify(j2)}`);
  process.exit(1);
}
const scheduleId = j2.schedule.schedule_id;
console.log(`✓ Schedule created: ${scheduleId} (cadence=DAILY time=${time_of_day} UTC, cap 0.01 USDC)`);

// 3. Spawn a Pact under this schedule
const r3 = await fetch(`${PRODUCTION}/api/scheduled-sends/spawn-pact`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    schedule_id: scheduleId,
    authority: Apk,
    periods_to_fund: 12,
  }),
});
const j3 = await r3.json();
if (!r3.ok) {
  console.error(`FAIL: spawn-pact build — ${r3.status} ${JSON.stringify(j3)}`);
  process.exit(1);
}
console.log(`✓ Spawn-pact tx built; pact_pubkey=${j3.pact_pubkey}`);

// 4. Sign + broadcast the open_pact tx
const txBuf = Buffer.from(j3.transaction, "base64");
const tx = Transaction.from(txBuf);
tx.partialSign(A);
const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
await connection.confirmTransaction({ signature: sig, blockhash: tx.recentBlockhash, lastValidBlockHeight: tx.lastValidBlockHeight }, "confirmed");
console.log(`✓ open_pact CONFIRMED: ${sig}`);
console.log(`  https://solscan.io/tx/${sig}?cluster=devnet`);

// 5. Attach the Pact back to the schedule
const r5 = await fetch(`${PRODUCTION}/api/scheduled-sends/attach-pact`, {
  method: "POST",
  headers: { "content-type": "application/json", ...signAuth() },
  body: JSON.stringify({
    schedule_id: scheduleId,
    owner_pubkey: Apk,
    pact_pubkey: j3.pact_pubkey,
    signature: sig,
  }),
});
const j5 = await r5.json();
console.log(`${r5.ok ? "✓" : "✗"} attach-pact → ${r5.status} ${JSON.stringify(j5).slice(0, 200)}`);

console.log(`\nAll prerequisites armed for production cron:
  - schedule_id:   ${scheduleId}
  - card_pubkey:   ${DELEGATED_CARD}
  - pact_pubkey:   ${j3.pact_pubkey}
  - cadence:       DAILY
  - time_of_day:   ${time_of_day} UTC (next ~3 min)
  - amount:        0.01 USDC
  - dest:          ${Apk} (self)

Next: phase5-tick cron sets last_fired_at ~3 min from now,
phase5-signer fires spend_via_pact, /admin/health shows 'confirmed'.

Watch: https://use-settle.vercel.app/admin/health`);
