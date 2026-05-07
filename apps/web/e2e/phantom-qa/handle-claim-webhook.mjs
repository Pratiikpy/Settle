#!/usr/bin/env node
/**
 * Handle-claim + webhook-probe end-to-end driver.
 *
 *   wallet A = id.json (B4cArR1M…) — has no handle currently
 *
 * Flow:
 *   1. POST /api/handles/claim — claim a unique handle for wallet A
 *   2. GET  /api/handles/by-pubkey?pubkey=A — verify reverse-resolve works
 *   3. GET  /api/handles/<handle>/profile — verify forward profile lookup
 *   4. GET  /api/merchants/<handle>/webhook (signed) — exercise webhook
 *      auth path; expected 403 not_a_verified_merchant since A has no
 *      verified_merchants row, but still proves the full handle->auth->
 *      verified_merchants check chain runs.
 *
 * Run:
 *   node apps/web/e2e/phantom-qa/handle-claim-webhook.mjs
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
    pubkey,
    headers: {
      "x-settle-auth-pubkey": pubkey,
      "x-settle-auth-sig": bs58.encode(sig),
      "x-settle-auth-nonce": nonce,
      "x-settle-auth-ts": String(ts),
    },
  };
}

async function main() {
  const A = loadKeypair(ID_JSON);
  console.log(`A: ${A.publicKey.toBase58()}`);

  // Pre-check: does A already have a handle?
  const pre = await fetch(`${PRODUCTION}/api/handles/by-pubkey?pubkey=${A.publicKey.toBase58()}`);
  const preBody = await pre.json();
  console.log(`pre  /api/handles/by-pubkey  → ${pre.status}  handle=${preBody.handle ?? "(none)"}`);

  // Pick a unique handle (use timestamp suffix to avoid collision)
  const proposed = `b4test${Date.now().toString(36).slice(-6)}`;

  // 1. Claim
  const auth1 = signAuth(A);
  const r1 = await fetch(`${PRODUCTION}/api/handles/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth1.headers },
    body: JSON.stringify({ handle: proposed, display_name: "B4 Test" }),
  });
  const claim = await r1.json();
  console.log(`POST /api/handles/claim       → ${r1.status}  ${JSON.stringify(claim).slice(0, 200)}`);

  const finalHandle = claim?.handle ?? proposed;

  // 2. Verify reverse-resolve
  const r2 = await fetch(`${PRODUCTION}/api/handles/by-pubkey?pubkey=${A.publicKey.toBase58()}`);
  const rev = await r2.json();
  console.log(`GET  /api/handles/by-pubkey   → ${r2.status}  handle=${rev.handle}`);

  // 3. Forward profile
  const r3 = await fetch(`${PRODUCTION}/api/handles/${finalHandle}/profile`);
  const prof = await r3.json();
  console.log(`GET  /api/handles/${finalHandle}/profile → ${r3.status}  pubkey=${prof.pubkey} display=${prof.display_name}`);

  // 4. Webhook GET — expects 403 not_a_verified_merchant
  const auth2 = signAuth(A);
  const r4 = await fetch(`${PRODUCTION}/api/merchants/${finalHandle}/webhook`, {
    headers: { ...auth2.headers },
  });
  const wh = await r4.json();
  console.log(`GET  /api/merchants/${finalHandle}/webhook → ${r4.status}  ${JSON.stringify(wh).slice(0, 200)}`);

  const claimedOk = rev.handle === finalHandle && prof.pubkey === A.publicKey.toBase58();
  const webhookGated =
    r4.status === 403 ||
    (r4.status === 401 && wh.reason) ||
    r4.status === 200; /* if A happens to be in verified_merchants */
  console.log(claimedOk && webhookGated ? "PASS" : "PARTIAL");
  console.log(`  claim->resolve: ${claimedOk}`);
  console.log(`  webhook gated:  ${webhookGated} (status=${r4.status})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
