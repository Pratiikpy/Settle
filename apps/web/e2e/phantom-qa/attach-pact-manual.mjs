#!/usr/bin/env node
import { readFileSync } from "fs";
import { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { randomBytes } from "crypto";

const ID_JSON = "C:\\Users\\prate\\.config\\solana\\id.json";
const A = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(ID_JSON, "utf8"))));
const Apk = A.publicKey.toBase58();

const ts = Math.floor(Date.now()/1000);
const nonce = randomBytes(16).toString("hex");
const msg = `Settle Auth\nnonce=${nonce}\nts=${ts}\npubkey=${Apk}`;
const sig = ed25519.sign(Buffer.from(msg, "utf8"), A.secretKey.slice(0,32));

const r = await fetch("https://use-settle.vercel.app/api/scheduled-sends/attach-pact", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-settle-auth-pubkey": Apk,
    "x-settle-auth-sig": bs58.encode(sig),
    "x-settle-auth-nonce": nonce,
    "x-settle-auth-ts": String(ts),
  },
  body: JSON.stringify({
    schedule_id: "e04dc961-2609-465d-9f64-51e85c174042",
    owner_pubkey: Apk,
    pact_pubkey: "62WLMvQskHDTGnUZGe8FUzgrMrf7rQzCDnqs7PFvEA8X",
    signature: "26eQpDRRjjgg5Q166YqcU7tHvdvqqoNzrfGxABzt4CvgUDWmnLa4x6PhxeSvdSjbuUmEMpWnQZ5HkPodnDrHGvmd",
  }),
});
const body = await r.text();
console.log(`attach-pact → ${r.status} ${body.slice(0, 400)}`);
