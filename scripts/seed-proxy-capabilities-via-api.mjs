// Contribute the 3 proxy-path capability hashes to /api/capabilities by
// hitting the public POST endpoint with a wallet-signed challenge from the
// deployer keypair. Idempotent.
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

const entries = [
  {
    capability_hash:
      "c45734b2b7ccbde7914419c2589e7cedee90e9cd58d792b91b5bd8c8162f7e87",
    alias: "Fetch arXiv abstract (proxy)",
    description:
      "ArxivFetch via use-settle x402 proxy. POST /api/x402/proxy/arxiv-fetch.",
    spec: {
      domain: "arxiv-fetch.demo.settle",
      method: "POST",
      path: "/api/x402/proxy/arxiv-fetch",
      amount_lamports: "100000",
      version: 1,
    },
  },
  {
    capability_hash:
      "f86d8bb555733e6843b17a94346d71e8ca04d7378dcebff51851603e62530e08",
    alias: "Translate JA-EN (proxy)",
    description:
      "TranslateAPI via use-settle x402 proxy. POST /api/x402/proxy/translate.",
    spec: {
      domain: "translate.demo.settle",
      method: "POST",
      path: "/api/x402/proxy/translate",
      amount_lamports: "300000",
      version: 1,
    },
  },
  {
    capability_hash:
      "ab180f449d75d42c5974fc9023c9d388d320dd4a1907fd64eb705fb90ea1dfb3",
    alias: "Summarize URL (proxy)",
    description:
      "SummaryLLM via use-settle x402 proxy. POST /api/x402/proxy/summarize.",
    spec: {
      domain: "summarize.demo.settle",
      method: "POST",
      path: "/api/x402/proxy/summarize",
      amount_lamports: "50000",
      version: 1,
    },
  },
];

function signAuth() {
  const tsUnix = Math.floor(Date.now() / 1000);
  const nonce = bs58.encode(crypto.getRandomValues(new Uint8Array(16)));
  const msg = `Settle Auth\nnonce=${nonce}\nts=${tsUnix}\npubkey=${pubkey}`;
  const sigBytes = ed25519.sign(new TextEncoder().encode(msg), secretKey.slice(0, 32));
  return {
    "x-settle-auth-pubkey": pubkey,
    "x-settle-auth-sig": bs58.encode(sigBytes),
    "x-settle-auth-nonce": nonce,
    "x-settle-auth-ts": String(tsUnix),
  };
}

let okCount = 0;
let failed = false;
for (const e of entries) {
  const auth = signAuth();
  const body = JSON.stringify({ ...e, contributed_by_pubkey: pubkey });
  const r = await fetch(`${BASE}/api/capabilities`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body,
  });
  const text = await r.text();
  if (r.status >= 200 && r.status < 300) {
    okCount += 1;
    console.log(`  ✓ ${e.alias} (${r.status}) ${text.slice(0, 100)}`);
  } else {
    failed = true;
    console.error(`  ✗ ${e.alias} (${r.status}) ${text.slice(0, 200)}`);
  }
}
console.log(`Done: ${okCount}/${entries.length} ok.`);
process.exit(failed ? 1 : 0);
