#!/usr/bin/env node
/**
 * Verify Bug #53 fix: /api/save-for must reject unauth + spoofed-owner.
 */
import { readFileSync } from "fs";
import { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { randomBytes } from "crypto";

const ID_JSON = process.platform === "win32"
  ? "C:\\Users\\prate\\.config\\solana\\id.json"
  : "/mnt/c/Users/prate/.config/solana/id.json";
const PRODUCTION = "https://use-settle.vercel.app";

function loadKp() {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(ID_JSON, "utf8"))));
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

const kp = loadKp();

// Test 1: unauthenticated POST → must 401
const r1 = await fetch(`${PRODUCTION}/api/save-for`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ owner_pubkey: kp.publicKey.toBase58(), label: "unauth", target_lamports: "100" }),
});
const j1 = await r1.json();
console.log(`unauth POST → ${r1.status}  ${JSON.stringify(j1).slice(0, 120)}`);

// Test 2: authed POST as self → 200
const a2 = signAuth(kp);
const r2 = await fetch(`${PRODUCTION}/api/save-for`, {
  method: "POST",
  headers: { "content-type": "application/json", ...a2.headers },
  body: JSON.stringify({ owner_pubkey: kp.publicKey.toBase58(), label: `authed-${Date.now()}`, target_lamports: "500000", category: "vacation" }),
});
const j2 = await r2.json();
console.log(`authed POST → ${r2.status}  ${JSON.stringify(j2).slice(0, 200)}`);

// Test 3: signed as kp but claim ownership for a DIFFERENT pubkey → must 403
const a3 = signAuth(kp);
const r3 = await fetch(`${PRODUCTION}/api/save-for`, {
  method: "POST",
  headers: { "content-type": "application/json", ...a3.headers },
  body: JSON.stringify({ owner_pubkey: "C7Dv2Dey8cPa6EKEdicK9Sa2nu3iPyFB4zwQd4K6cWbq", label: "spoof", target_lamports: "100" }),
});
const j3 = await r3.json();
console.log(`spoof  POST → ${r3.status}  ${JSON.stringify(j3).slice(0, 150)}`);

const pass = r1.status === 401 && r2.status === 200 && r3.status === 403;
console.log(pass ? "PASS — Bug #53 fix complete" : "FAIL");
process.exit(pass ? 0 : 1);
