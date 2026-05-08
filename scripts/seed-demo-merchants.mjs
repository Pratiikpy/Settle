// One-shot seeder caller: hits POST /api/admin/seed-demo-merchants with a
// deployer wallet sig so the proxy's verified_merchants lookup returns
// verified=true for the 3 demo merchant pubkeys. Idempotent.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

const KEYPAIR_PATH = resolve(homedir(), ".config", "solana", "id.json");
const secretKey = new Uint8Array(JSON.parse(readFileSync(KEYPAIR_PATH, "utf8")));
const deployer = Keypair.fromSecretKey(secretKey);
const pubkey = deployer.publicKey.toBase58();
console.log("Deployer:", pubkey);

const BASE = process.env.BASE_URL ?? "https://use-settle.vercel.app";

const tsUnix = Math.floor(Date.now() / 1000);
const nonce = bs58.encode(crypto.getRandomValues(new Uint8Array(16)));
const msg = `Settle Auth\nnonce=${nonce}\nts=${tsUnix}\npubkey=${pubkey}`;
const sigBytes = ed25519.sign(new TextEncoder().encode(msg), secretKey.slice(0, 32));

const r = await fetch(`${BASE}/api/admin/seed-demo-merchants`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-settle-auth-pubkey": pubkey,
    "x-settle-auth-sig": bs58.encode(sigBytes),
    "x-settle-auth-nonce": nonce,
    "x-settle-auth-ts": String(tsUnix),
  },
  body: "{}",
});
const text = await r.text();
console.log(`Status: ${r.status}`);
console.log(text);
process.exit(r.status >= 200 && r.status < 300 ? 0 : 1);
