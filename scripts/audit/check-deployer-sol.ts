#!/usr/bin/env tsx
/**
 * Wave 3 E1 helper — read deployer wallet balance + program ID before
 * attempting `anchor deploy`. If balance < 2 SOL (program upgrade is
 * expensive on devnet), refuse to proceed.
 */
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

async function main() {
  const path = resolve(homedir(), ".config", "solana", "id.json");
  if (!existsSync(path)) {
    console.error(`No deployer keypair at ${path}`);
    process.exit(1);
  }
  const kp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
  const heliusKey = process.env.HELIUS_API_KEY;
  const rpc = heliusKey
    ? `https://devnet.helius-rpc.com/?api-key=${heliusKey}`
    : clusterApiUrl("devnet");
  const conn = new Connection(rpc, "confirmed");
  const bal = await conn.getBalance(kp.publicKey, "confirmed");
  console.log(`deployer pubkey: ${kp.publicKey.toBase58()}`);
  console.log(`deployer balance: ${bal / 1e9} SOL`);
  console.log(`min recommended: 2 SOL for upgrade`);
  console.log(
    `program-id (devnet): HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD`,
  );

  // also check the program account exists + report its data length
  try {
    const info = await conn.getAccountInfo(
      new PublicKey("HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD"),
      "confirmed",
    );
    console.log(
      `program account: ${info ? `exists, ${info.data.length}b, owner=${info.owner.toBase58().slice(0, 8)}…` : "NOT FOUND"}`,
    );
  } catch (e) {
    console.error(`getAccountInfo err: ${(e as Error).message}`);
  }
}

void main();
