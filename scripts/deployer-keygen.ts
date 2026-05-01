#!/usr/bin/env tsx
/**
 * deployer-keygen — generate the Solana CLI deployer keypair.
 *
 * The keypair this writes plays two roles after deploy:
 *   1. Program deploy fee payer (~5 SOL on devnet, refundable on close)
 *   2. Program upgrade authority — i.e. who can later `solana program deploy
 *      --upgrade-authority` to push a new program build to the same Program ID
 *
 * Files written:
 *   ~/.config/solana/id.json — the Solana CLI default keypair location, used
 *                              by `solana` and `anchor` commands automatically
 *
 * If the file already exists, this script aborts (we never overwrite a wallet).
 *
 * Usage:
 *   pnpm tsx scripts/deployer-keygen.ts
 *   # then airdrop ~5 SOL to the printed pubkey on devnet
 */

import { Keypair } from "@solana/web3.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const target = join(homedir(), ".config", "solana", "id.json");

if (existsSync(target)) {
  console.error(`✗ ${target} already exists — refusing to overwrite.`);
  console.error("  If you want a fresh wallet, move the existing file first.");
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });

const kp = Keypair.generate();
const secretArray = Array.from(kp.secretKey);
writeFileSync(target, JSON.stringify(secretArray));

console.log("\n══════════════════════════════════════════════════════════════════");
console.log(" Settle deployer keypair generated");
console.log("══════════════════════════════════════════════════════════════════\n");
console.log(`Pubkey       : ${kp.publicKey.toBase58()}`);
console.log(`Wallet file  : ${target}`);
console.log(`Format       : JSON array of 64 bytes (Solana CLI default)\n`);
console.log("Trust scope:");
console.log("  - Pays for `pnpm deploy:devnet` (~5 SOL on devnet, refundable)");
console.log("  - Becomes the program upgrade authority by default\n");
console.log("Next steps:");
console.log("  1. Fund this address with SOL on devnet (~5 SOL recommended).");
console.log("     Devnet faucet: https://faucet.solana.com/  (paste the pubkey)");
console.log("     Or via CLI once installed:");
console.log(`       solana airdrop 5 ${kp.publicKey.toBase58()} --url devnet`);
console.log("  2. Install Solana CLI + Anchor (see scripts/deploy-devnet.sh header).");
console.log("  3. Run: pnpm deploy:devnet\n");
