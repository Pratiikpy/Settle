#!/usr/bin/env node
/**
 * Drive /api/import/solana-pay end-to-end: take a real on-chain SPL transfer
 * signature (from real-onchain-send.mjs) and import it into Settle's
 * receipts. Proves the cross-app receipt importer works for any signed
 * USDC transfer.
 *
 * Closes MISSION ⚠️ 'Import receipt'.
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

// The 0.01 USDC consumer-send tx from real-onchain-send.mjs
const SIG = "2s71RsGrSML2Qu2eabEbkSg8aeMtHX2E9vhWvSMiM7N8KgGdwuMyMnVuWoBsCsJMRUZ61RWMXpeWUnHtH5kGjNMk";

const A = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(ID_JSON, "utf8"))));

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

console.log(`A: ${A.publicKey.toBase58()}`);
console.log(`tx to import: ${SIG}\n`);

const r = await fetch(`${PRODUCTION}/api/import/solana-pay`, {
  method: "POST",
  headers: { "content-type": "application/json", ...signAuth(A) },
  body: JSON.stringify({ signature: SIG, caller_pubkey: A.publicKey.toBase58() }),
});
const j = await r.json();
console.log(`POST /api/import/solana-pay → ${r.status}`);
console.log(JSON.stringify(j, null, 2).slice(0, 800));

if (r.ok || j.idempotent) {
  console.log("\nPASS — receipt imported (or already imported idempotently)");
  if (j.request_id) {
    console.log(`  request_id: ${j.request_id}`);
    console.log(`  receipt page: ${PRODUCTION}/r/${j.request_id}`);
  }
  process.exit(0);
} else {
  console.error("\nFAIL");
  process.exit(1);
}
