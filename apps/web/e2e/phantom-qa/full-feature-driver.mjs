#!/usr/bin/env node
/**
 * Full-feature programmatic driver — exercises every endpoint hardened
 * this session with real signed wallet auth, confirming none of the
 * Bug #53–#61 fixes broke the legit flow.
 *
 *   wallet A = id.json (B4cArR1M…) — claimed handle b4testv9l8cq
 *
 * Endpoints touched:
 *   1.  POST /api/save-for                      → creates savings bucket
 *   2.  POST /api/round-up                      → creates round-up rule
 *   3.  POST /api/scheduled-sends               → creates scheduled send
 *   4.  POST /api/auto-refill                   → (would need a real card; just probe)
 *   5.  POST /api/gift-sends                    → creates pending gift
 *   6.  POST /api/allowances                    → creates kid allowance
 *   7.  POST /api/capabilities                  → contributes capability alias
 *   8.  POST /api/bookkeeper/categorize         → triggers categorize run
 *   9.  POST /api/fraud/scan                    → triggers fraud scan
 *   10. POST /api/group-accounts                → creates group with 3 voters
 *   11. POST /api/group-accounts/request-spend  → B proposes spend
 *   12. POST /api/handles/claim                 → (already claimed; idempotent)
 *
 * Each writes the test counter so we can see the exact scope.
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

function loadKeypair(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

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

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const A = loadKeypair(ID_JSON);
const B = Keypair.generate();
const C = Keypair.generate();
const Apk = A.publicKey.toBase58();
console.log(`A=${Apk}`);
console.log(`B=${B.publicKey.toBase58()}`);
console.log(`C=${C.publicKey.toBase58()}\n`);

const stamp = Date.now();

// 1. Save-for
{
  const r = await fetch(`${PRODUCTION}/api/save-for`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({ owner_pubkey: Apk, label: `bucket-${stamp}`, target_lamports: "500000", category: "vacation" }),
  });
  const j = await r.json();
  log(r.ok, "save-for create", `${r.status} bucket=${j.bucket?.bucket_id?.slice(0, 8) ?? "?"}…`);
}

// 2. Round-up
{
  const r = await fetch(`${PRODUCTION}/api/round-up`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({ owner_pubkey: Apk, round_to_lamports: "500000", dest_pubkey: B.publicKey.toBase58() }),
  });
  const j = await r.json();
  log(r.ok, "round-up upsert", `${r.status} rule=${j.rule?.rule_id?.slice(0, 8) ?? "?"}…`);
}

// 3. Scheduled-send
{
  const r = await fetch(`${PRODUCTION}/api/scheduled-sends`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({
      owner_pubkey: Apk, dest_pubkey: B.publicKey.toBase58(), amount_lamports: "100000",
      cadence: "DAILY", time_of_day: "12:00",
    }),
  });
  const j = await r.json();
  log(r.ok, "scheduled-send create", `${r.status} schedule=${j.schedule?.schedule_id?.slice(0, 8) ?? "?"}…`);
}

// 4. Gift-send
{
  const r = await fetch(`${PRODUCTION}/api/gift-sends`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({
      sender_pubkey: Apk, recipient_handle: "b4testv9l8cq", escrow_card: B.publicKey.toBase58(), amount_lamports: "50000",
    }),
  });
  const j = await r.json();
  log(r.ok, "gift-send create", `${r.status} gift=${j.gift?.gift_id?.slice(0, 8) ?? "?"}…`);
}

// 5. Allowances
{
  const r = await fetch(`${PRODUCTION}/api/allowances`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({
      parent_pubkey: Apk, kid_pubkey: B.publicKey.toBase58(),
      weekly_lamports: "200000", daily_cap_lamports: "100000", time_of_day: "12:00",
    }),
  });
  const j = await r.json();
  log(r.ok, "allowance create", `${r.status} allowance=${j.allowance?.allowance_id?.slice(0, 8) ?? "?"}…`);
}

// 6. Capabilities
{
  const fakeHash = "a".repeat(64);
  const r = await fetch(`${PRODUCTION}/api/capabilities`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({
      capability_hash: fakeHash, alias: `test-cap-${stamp}`, contributed_by_pubkey: Apk,
    }),
  });
  const j = await r.json();
  log(r.ok, "capabilities contribute", `${r.status} ${j.message ?? j.error ?? "ok"}`);
}

// 7. Bookkeeper categorize
{
  const r = await fetch(`${PRODUCTION}/api/bookkeeper/categorize`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({ pubkey: Apk, limit: 5 }),
  });
  const j = await r.json();
  log(r.ok, "bookkeeper categorize", `${r.status} scanned=${j.scanned ?? 0}`);
}

// 8. Fraud scan
{
  const r = await fetch(`${PRODUCTION}/api/fraud/scan`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({ pubkey: Apk }),
  });
  const j = await r.json();
  log(r.ok, "fraud scan", `${r.status} flags=${j.flags?.length ?? 0}`);
}

// 9. Group-accounts create
let groupId;
{
  const r = await fetch(`${PRODUCTION}/api/group-accounts`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({
      custodian_pubkey: Apk, holding_card: Apk, label: `full-driver-${stamp}`, quorum: 2,
      members: [
        { pubkey: Apk, role: "voter" },
        { pubkey: B.publicKey.toBase58(), role: "voter" },
        { pubkey: C.publicKey.toBase58(), role: "voter" },
      ],
    }),
  });
  const j = await r.json();
  groupId = j.group?.group_id;
  log(r.ok, "group-accounts create", `${r.status} group=${groupId?.slice(0, 8) ?? "?"}…`);
}

// 10. Group request-spend (B proposes)
if (groupId) {
  const r = await fetch(`${PRODUCTION}/api/group-accounts/request-spend`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(B) },
    body: JSON.stringify({
      group_id: groupId, requester_pubkey: B.publicKey.toBase58(),
      dest_pubkey: C.publicKey.toBase58(), amount_usdc: "0.01",
    }),
  });
  const j = await r.json();
  log(r.ok, "group request-spend (B proposes)", `${r.status} request=${j.request_id?.slice(0, 8) ?? "?"}…`);
}

// 11. Split-bill (full flow)
{
  const r = await fetch(`${PRODUCTION}/api/split-bills`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify({ label: `full-driver-${stamp}`, target_total_lamports: "200000", n_payers: 2 }),
  });
  const j = await r.json();
  log(r.ok, "split-bill create", `${r.status} bill=${j.id?.slice(0, 8) ?? "?"}…`);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
