#!/usr/bin/env node
/**
 * Multi-wallet split-bill end-to-end driver.
 *
 *   wallet A = user's id.json (B4cArR1M…) — the bill organizer
 *   wallet B = newly-generated burner — a 2nd payer
 *
 * Flow:
 *   1. A signs auth challenge → POST /api/split-bills (creates bill)
 *   2. GET  /api/split-bills/<id> (verify bill persisted)
 *   3. POST /api/split-bills/<id>/pay (server builds B's unsigned payment tx)
 *      - Proves the multi-wallet payment-tx-build path works without Phantom signing
 *
 * Run:
 *   node apps/web/e2e/phantom-qa/split-bill-multiwallet.mjs
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
    auth_pubkey: pubkey,
    auth_sig: bs58.encode(sig),
    auth_nonce: nonce,
    auth_ts: String(ts),
  };
}

async function main() {
  const A = loadKeypair(ID_JSON);
  const B = Keypair.generate();
  console.log(`A (organizer): ${A.publicKey.toBase58()}`);
  console.log(`B (payer):     ${B.publicKey.toBase58()}`);

  // 1. A creates split-bill
  const auth = signAuth(A);
  const headers = {
    "content-type": "application/json",
    "x-settle-auth-pubkey": auth.auth_pubkey,
    "x-settle-auth-sig": auth.auth_sig,
    "x-settle-auth-nonce": auth.auth_nonce,
    "x-settle-auth-ts": auth.auth_ts,
  };
  const createBody = {
    label: `multiwallet-test-${Date.now()}`,
    target_total_lamports: "200000", // 0.20 USDC
    n_payers: 2,
  };
  const r1 = await fetch(`${PRODUCTION}/api/split-bills`, {
    method: "POST",
    headers,
    body: JSON.stringify(createBody),
  });
  const create = await r1.json();
  console.log(`POST /api/split-bills → ${r1.status} ${JSON.stringify(create)}`);
  if (!r1.ok) {
    console.error("FAIL — create");
    process.exit(1);
  }
  const billId = create.id;

  // 2. GET the bill (no auth required for read)
  const r2 = await fetch(`${PRODUCTION}/api/split-bills/${billId}`);
  const bill = await r2.json();
  console.log(`GET  /api/split-bills/${billId} → ${r2.status}`);
  console.log(`     organizer=${bill.organizer_pubkey} per_payer=${bill.per_payer_lamports} n=${bill.n_payers}`);

  // 3. Wallet B requests its unsigned payment tx
  const r3 = await fetch(`${PRODUCTION}/api/split-bills/${billId}/pay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: B.publicKey.toBase58() }),
  });
  const pay = await r3.json();
  console.log(`POST /api/split-bills/${billId}/pay → ${r3.status}`);
  if (r3.ok) {
    console.log(`     unsigned-tx size=${pay.transaction.length}b reference=${pay.reference} per_payer=${pay.per_payer_lamports}`);
    console.log("PASS — multi-wallet split-bill flow validated end-to-end");
  } else {
    console.log(`     body=${JSON.stringify(pay)}`);
    console.error("FAIL — pay");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
