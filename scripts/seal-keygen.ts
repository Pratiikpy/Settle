#!/usr/bin/env tsx
/**
 * Generate a libsodium sealed-box X25519 keypair for off-chain receipt metadata encryption.
 *
 * Usage:
 *   pnpm tsx scripts/seal-keygen.ts
 *
 * Outputs base64-encoded pubkey + privkey to stdout. Save to .env.local:
 *   SETTLE_SEALED_BOX_PUBKEY=<base64>
 *   SETTLE_SEALED_BOX_PRIVKEY=<base64>
 *
 * The pubkey is used to encrypt receipts to the dashboard owner. Anyone with the privkey can
 * decrypt — keep it server-only and never commit it to git.
 *
 * V1 uses a single global keypair per Settle deployment. V2 will issue per-user keypairs at
 * card creation time so the user controls their own receipts (genuinely self-custodial).
 */

import { x25519 } from "@noble/curves/ed25519";
import { randomBytes } from "node:crypto";

function main() {
  const priv = randomBytes(32);
  const pub = x25519.getPublicKey(priv);

  console.log("Settle sealed-box keypair (X25519)");
  console.log("─────────────────────────────────────");
  console.log(`SETTLE_SEALED_BOX_PUBKEY=${Buffer.from(pub).toString("base64")}`);
  console.log(`SETTLE_SEALED_BOX_PRIVKEY=${Buffer.from(priv).toString("base64")}`);
  console.log("");
  console.log("Save both to .env.local. The privkey decrypts off-chain receipt metadata —");
  console.log("keep it server-only.");
}

main();
