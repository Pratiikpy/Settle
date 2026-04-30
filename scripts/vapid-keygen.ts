#!/usr/bin/env tsx
/**
 * Generate a VAPID P-256 keypair for Web Push.
 *
 * Run once and paste the output into Vercel env vars (and .env for local):
 *   SETTLE_VAPID_PUBLIC_KEY  — also exposed as NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   SETTLE_VAPID_PRIVATE_KEY — server-only
 *   SETTLE_VAPID_SUBJECT     — mailto:contact@yourdomain
 *
 * The public key gets fetched by the browser at subscribe time. The private key
 * signs JWT tokens that authenticate your server to the push service (FCM /
 * Mozilla autopush). No shared secrets — push services verify each push against
 * the public key the user subscribed with.
 */

import { p256 } from "@noble/curves/p256";

function uint8ToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

const privateKey = p256.utils.randomPrivateKey();
const publicKey = p256.getPublicKey(privateKey, false); // uncompressed (65 bytes, 0x04 prefix)

const publicB64 = uint8ToBase64Url(publicKey);
const privateB64 = uint8ToBase64Url(privateKey);

console.log("\n# VAPID keys for Web Push — paste into .env / Vercel env\n");
console.log(`SETTLE_VAPID_PUBLIC_KEY=${publicB64}`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicB64}`);
console.log(`SETTLE_VAPID_PRIVATE_KEY=${privateB64}`);
console.log(`SETTLE_VAPID_SUBJECT=mailto:contact@settle.demo`);
console.log("");
