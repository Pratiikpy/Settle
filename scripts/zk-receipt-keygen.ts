#!/usr/bin/env tsx
/**
 * zk-receipt-keygen — generate a fresh keypair for the Settle ZK-receipt mint
 * authority. Used by compress-cron to:
 *
 *   - Pay tx fees + Light Protocol per-account rent (~0.001 SOL/receipt
 *     amortized over many state-tree updates)
 *   - Sign the createMint instruction once (mint setup)
 *   - Sign mintTo per receipt (the buyer never signs — they're the recipient)
 *
 * Trust scope: this key can mint *Settle Receipt* compressed tokens to any
 * wallet. It has no authority over the settle-agent-card program. Compromise
 * surface: spam tokens (annoying but no financial loss). Keep separate from
 * SETTLE_FACILITATOR_PRIVKEY and SETTLE_BADGE_AUTHORITY_PRIVKEY.
 *
 * Usage:
 *   pnpm zk:keygen
 *   # then add the printed lines to .env.local
 *   # then airdrop ~0.5 SOL on devnet
 *   # then run `pnpm zk:mint-setup` to create the mint
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const kp = Keypair.generate();
const secretB58 = bs58.encode(kp.secretKey);

console.log("\n══════════════════════════════════════════════════════════════════");
console.log(" Settle ZK-receipt authority — fresh keypair generated");
console.log("══════════════════════════════════════════════════════════════════\n");
console.log(`Pubkey         : ${kp.publicKey.toBase58()}`);
console.log(`Secret (base58): ${secretB58}\n`);
console.log("Add to .env.local:");
console.log(`SETTLE_ZK_RECEIPT_AUTHORITY_PRIVKEY=${secretB58}`);
console.log(`SETTLE_ZK_RECEIPT_AUTHORITY_PUBKEY=${kp.publicKey.toBase58()}`);
console.log("\nFund with devnet SOL for compressed-token rent:");
console.log(`  solana airdrop 1 ${kp.publicKey.toBase58()} --url devnet\n`);
console.log("Then create the mint:");
console.log("  pnpm zk:mint-setup\n");
console.log(
  "Trust scope: mints `Settle Receipt` compressed tokens. No financial\n" +
    "authority over the settle-agent-card program. Keep distinct from\n" +
    "SETTLE_FACILITATOR_PRIVKEY / SETTLE_BADGE_AUTHORITY_PRIVKEY.\n",
);
