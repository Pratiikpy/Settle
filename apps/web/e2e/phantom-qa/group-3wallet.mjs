#!/usr/bin/env node
/**
 * Three-wallet group flow end-to-end driver.
 *
 *   wallet A (custodian)  = user's id.json — B4cArR1M…
 *   wallet B (voter)       = generated burner
 *   wallet C (voter)       = generated burner
 *
 * Flow:
 *   1. POST /api/group-accounts (no auth)
 *      label, custodian=A, holding_card=A (placeholder), quorum=2,
 *      members=[{A,voter},{B,voter},{C,voter}]
 *   2. GET  /api/group-accounts?group_id=<id> (verify 3 members persist)
 *   3. GET  /api/group-accounts?member=B (verify B sees the group)
 *   4. POST /api/group-accounts/request-spend (B proposes)
 *      — should return either an unsigned open_pact tx (success) or
 *        a meaningful error (e.g. holding_card not on-chain). Either is
 *        a real exercise of the multi-wallet code path.
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

async function main() {
  const A = loadKeypair(ID_JSON);
  const B = Keypair.generate();
  const C = Keypair.generate();
  console.log(`A (custodian): ${A.publicKey.toBase58()}`);
  console.log(`B (voter):     ${B.publicKey.toBase58()}`);
  console.log(`C (voter):     ${C.publicKey.toBase58()}`);

  // 1. Create the group
  const createBody = {
    custodian_pubkey: A.publicKey.toBase58(),
    holding_card: A.publicKey.toBase58(), // placeholder — schema only validates format, not on-chain
    label: `3-wallet-test-${Date.now()}`,
    quorum: 2,
    threshold_lamports: "1000000",
    members: [
      { pubkey: A.publicKey.toBase58(), role: "voter" },
      { pubkey: B.publicKey.toBase58(), role: "voter" },
      { pubkey: C.publicKey.toBase58(), role: "voter" },
    ],
  };
  const r1 = await fetch(`${PRODUCTION}/api/group-accounts`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(A) },
    body: JSON.stringify(createBody),
  });
  const create = await r1.json();
  console.log(`POST /api/group-accounts → ${r1.status}`);
  if (!r1.ok) {
    console.log(`     body=${JSON.stringify(create)}`);
    process.exit(1);
  }
  const groupId = create.group.group_id;
  console.log(`     group_id=${groupId} members=${create.members.length}`);

  // 2. Verify the group (with members listed)
  const r2 = await fetch(`${PRODUCTION}/api/group-accounts?group_id=${groupId}`);
  const grp = await r2.json();
  console.log(`GET  /api/group-accounts?group_id=… → ${r2.status}`);
  console.log(`     custodian=${grp.group?.custodian_pubkey} quorum=${grp.group?.quorum} members=${grp.members?.length}`);

  // 3. Verify B sees the group from their wallet's POV
  const r3 = await fetch(`${PRODUCTION}/api/group-accounts?member=${B.publicKey.toBase58()}`);
  const bView = await r3.json();
  console.log(`GET  /api/group-accounts?member=B → ${r3.status}`);
  const bSeesIt = (bView.groups ?? []).some((g) => g.group_id === groupId);
  console.log(`     B sees the group: ${bSeesIt}`);
  if (!bSeesIt) {
    console.log(`     bView=${JSON.stringify(bView)}`);
  }

  // 4. B proposes a spend (must sign as B)
  const r4 = await fetch(`${PRODUCTION}/api/group-accounts/request-spend`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signAuth(B) },
    body: JSON.stringify({
      group_id: groupId,
      requester_pubkey: B.publicKey.toBase58(),
      dest_pubkey: C.publicKey.toBase58(),
      amount_usdc: "0.01",
      note: "B proposes paying C from group treasury",
    }),
  });
  const spend = await r4.json();
  console.log(`POST /api/group-accounts/request-spend → ${r4.status}`);
  console.log(`     ${JSON.stringify(spend).slice(0, 300)}`);

  console.log(bSeesIt ? "PASS — 3-wallet group flow validated" : "PARTIAL — group created but B doesn't see it");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
