#!/usr/bin/env tsx
/**
 * badge-keygen — generate a fresh Solana keypair for the Settle badge authority.
 *
 * The badge authority:
 *   - Pays MPL Core asset rent (~0.0028 SOL per badge)
 *   - Signs the create + freeze plugin ix
 *   - Has burn rights (admin remediation)
 *
 * It does NOT have any other Settle program authority. It cannot spend, claim
 * streaming pacts, or release escrow. Compromise scope: badge spam (visible
 * pollution but no financial loss). Keep separate from SETTLE_FACILITATOR_PRIVKEY.
 *
 * Usage:
 *   pnpm badge:keygen
 *   # then add the printed line to .env.local
 *   # then airdrop ~0.5 SOL to the printed pubkey on devnet for ~150 mint capacity
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const kp = Keypair.generate();
const secretB58 = bs58.encode(kp.secretKey);

console.log("\n══════════════════════════════════════════════════════════════════");
console.log(" Settle badge authority — fresh keypair generated");
console.log("══════════════════════════════════════════════════════════════════\n");
console.log(`Pubkey         : ${kp.publicKey.toBase58()}`);
console.log(`Secret (base58): ${secretB58}\n`);
console.log("Add to .env.local:");
console.log(`SETTLE_BADGE_AUTHORITY_PRIVKEY=${secretB58}`);
console.log(`SETTLE_BADGE_AUTHORITY_PUBKEY=${kp.publicKey.toBase58()}`);
console.log("\nFund with devnet SOL for badge rent:");
console.log(`  solana airdrop 1 ${kp.publicKey.toBase58()} --url devnet\n`);
console.log(
  "Trust scope: this key only mints + burns soulbound MPL Core badges. It has\n" +
    "no Settle program authority. Compromise = badge spam, no financial loss.\n" +
    "Keep distinct from SETTLE_FACILITATOR_PRIVKEY.\n",
);
