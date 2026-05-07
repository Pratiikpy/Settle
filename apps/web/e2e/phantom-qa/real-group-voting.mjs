#!/usr/bin/env node
/**
 * Full 3-wallet group voting end-to-end:
 *   1. A creates group with custodian=A, voters=[A,B,C], quorum=2
 *   2. B proposes spend → server returns request_id + open_pact tx
 *   3. B signs approval message (Ed25519) → POST /approve → first vote
 *   4. C signs approval message → POST /approve → quorum reached
 *   5. GET /group-accounts/<id>/requests → status=quorum_met
 *
 * Closes the literal "use 3 wallets for groups, all the way to quorum"
 * demand the user kept emphasizing.
 */

import { readFileSync } from "fs";
import { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { randomBytes } from "crypto";

const PRODUCTION = "https://use-settle.vercel.app";
const ID_JSON = process.platform === "win32"
  ? "C:\\Users\\prate\\.config\\solana\\id.json"
  : "/mnt/c/Users/prate/.config/solana/id.json";

function loadKp(p) { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8")))); }

function signAuth(kp) {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const pubkey = kp.publicKey.toBase58();
  const msg = `Settle Auth\nnonce=${nonce}\nts=${ts}\npubkey=${pubkey}`;
  const sig = ed25519.sign(Buffer.from(msg, "utf8"), kp.secretKey.slice(0, 32));
  return {
    "x-settle-auth-pubkey": pubkey,
    "x-settle-auth-sig": bs58.encode(sig),
    "x-settle-auth-nonce": nonce,
    "x-settle-auth-ts": String(ts),
  };
}

function signVote(kp, group_id, request_id, amount_lamports, dest_pubkey, decision) {
  const message = `settle:group-spend:${group_id}:${request_id}:${amount_lamports}:${dest_pubkey}:${decision}`;
  const sig = ed25519.sign(Buffer.from(message, "utf8"), kp.secretKey.slice(0, 32));
  return bs58.encode(sig);
}

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const A = loadKp(ID_JSON);
const B = Keypair.generate();
const C = Keypair.generate();
console.log(`A (custodian): ${A.publicKey.toBase58()}`);
console.log(`B (voter):     ${B.publicKey.toBase58()}`);
console.log(`C (voter):     ${C.publicKey.toBase58()}\n`);

// 1. Create group
const r1 = await fetch(`${PRODUCTION}/api/group-accounts`, {
  method: "POST",
  headers: { "content-type": "application/json", ...signAuth(A) },
  body: JSON.stringify({
    custodian_pubkey: A.publicKey.toBase58(),
    holding_card: A.publicKey.toBase58(),
    label: `voting-${Date.now()}`,
    quorum: 2,
    members: [
      { pubkey: A.publicKey.toBase58(), role: "voter" },
      { pubkey: B.publicKey.toBase58(), role: "voter" },
      { pubkey: C.publicKey.toBase58(), role: "voter" },
    ],
  }),
});
const j1 = await r1.json();
log(r1.ok, "1. Create group", `group=${j1.group?.group_id?.slice(0, 8)}…`);
const groupId = j1.group?.group_id;
if (!groupId) process.exit(1);

// 2. B proposes a spend
const r2 = await fetch(`${PRODUCTION}/api/group-accounts/request-spend`, {
  method: "POST",
  headers: { "content-type": "application/json", ...signAuth(B) },
  body: JSON.stringify({
    group_id: groupId,
    requester_pubkey: B.publicKey.toBase58(),
    dest_pubkey: C.publicKey.toBase58(),
    amount_usdc: "0.01",
  }),
});
const j2 = await r2.json();
log(r2.ok, "2. B proposes spend", `request=${j2.request_id?.slice(0, 8)}…`);
const requestId = j2.request_id;
const amount_lamports = "10000"; // 0.01 USDC = 10000 atomic
const dest = C.publicKey.toBase58();

// 3. B votes "approve" — signs the canonical message
const bSig = signVote(B, groupId, requestId, amount_lamports, dest, "approve");
const r3 = await fetch(`${PRODUCTION}/api/group-accounts/approve`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    group_id: groupId,
    request_id: requestId,
    member_pubkey: B.publicKey.toBase58(),
    amount_lamports,
    dest_pubkey: dest,
    decision: "approve",
    signature_b58: bSig,
  }),
});
const j3 = await r3.json();
log(r3.ok, "3. B votes approve (Ed25519 sig over canonical msg)", `tally=${JSON.stringify(j3.tally ?? j3.status ?? j3.error)}`);

// 4. C votes "approve" — should reach quorum (2 of 3)
const cSig = signVote(C, groupId, requestId, amount_lamports, dest, "approve");
const r4 = await fetch(`${PRODUCTION}/api/group-accounts/approve`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    group_id: groupId,
    request_id: requestId,
    member_pubkey: C.publicKey.toBase58(),
    amount_lamports,
    dest_pubkey: dest,
    decision: "approve",
    signature_b58: cSig,
  }),
});
const j4 = await r4.json();
log(r4.ok, "4. C votes approve (reaches quorum)", JSON.stringify(j4).slice(0, 200));

// 5. Verify request status flipped to quorum_met
const r5 = await fetch(`${PRODUCTION}/api/group-accounts/${groupId}/requests`);
const j5 = await r5.json();
const ourRequest = (j5.requests ?? []).find((r) => r.request_id === requestId);
log(
  ourRequest?.status === "quorum_met",
  "5. Request status = quorum_met",
  `status=${ourRequest?.status} approvals=${ourRequest?.approvals_count}`,
);

// 6. Verify a stranger can't double-vote (B tries again with same data)
const dupeSig = signVote(B, groupId, requestId, amount_lamports, dest, "approve");
const r6 = await fetch(`${PRODUCTION}/api/group-accounts/approve`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    group_id: groupId,
    request_id: requestId,
    member_pubkey: B.publicKey.toBase58(),
    amount_lamports,
    dest_pubkey: dest,
    decision: "approve",
    signature_b58: dupeSig,
  }),
});
const j6 = await r6.json();
log(r6.status === 409, "6. B's double-vote correctly rejected (UNIQUE constraint)", `${r6.status} ${j6.error}`);

// 7. Verify a forged signature gets rejected (use B's keypair claiming to be C)
const forgedSig = signVote(B, groupId, requestId, amount_lamports, dest, "approve");
const r7 = await fetch(`${PRODUCTION}/api/group-accounts/approve`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    group_id: groupId,
    request_id: requestId,
    // Claim to be a non-member but with B's signature
    member_pubkey: A.publicKey.toBase58(), // A IS a member but already voted? No, A hasn't voted yet
    amount_lamports,
    dest_pubkey: dest,
    decision: "approve",
    signature_b58: forgedSig,
  }),
});
const j7 = await r7.json();
log(r7.status === 401 || r7.status === 403, "7. Forged sig (B's bytes claiming A) correctly rejected", `${r7.status} ${j7.error}`);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
