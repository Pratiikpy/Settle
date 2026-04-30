#!/usr/bin/env tsx
/**
 * One-time cNFT infrastructure setup for Settle Receipts.
 *
 * Usage:
 *   pnpm tsx scripts/cnft-setup.ts
 *
 * What it does:
 *   1. Loads SETTLE_TREE_AUTHORITY_KEYPAIR_B58 (or generates a fresh one)
 *   2. Funds it via devnet airdrop if balance < 5 SOL
 *   3. Creates a Token Metadata collection NFT ("Settle Receipts")
 *   4. Creates a Bubblegum V1 concurrent merkle tree (max_depth 20, canopy 13, max_buffer_size 64)
 *      ≈ 1M leaf capacity at ~8.5 SOL one-time rent
 *      ≈ ~$0.001 per cNFT mint after that
 *   5. Prints the addresses to add to .env.local
 *
 * Pre-reqs:
 *   - HELIUS_API_KEY in env (for DAS API + Sender)
 *   - Cluster set via NEXT_PUBLIC_SOLANA_CLUSTER (default: devnet)
 *
 * IMPORTANT: do NOT commit the tree authority keypair to git.
 */

import {
  createUmi,
} from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey as umiPublicKey,
  sol,
  none,
  type Umi,
} from "@metaplex-foundation/umi";
import { mplBubblegum, createTree } from "@metaplex-foundation/mpl-bubblegum";
import {
  mplTokenMetadata,
  createNft,
} from "@metaplex-foundation/mpl-token-metadata";
import bs58 from "bs58";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });
config(); // fallback

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return cluster === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

async function loadOrCreateAuthority(umi: Umi) {
  const fromEnv = process.env.SETTLE_TREE_AUTHORITY_KEYPAIR_B58;
  if (fromEnv) {
    const secret = bs58.decode(fromEnv);
    return umi.eddsa.createKeypairFromSecretKey(secret);
  }
  // Try to read from a local keypair file
  try {
    const raw = readFileSync("keys/cnft-authority.json", "utf8");
    const arr = JSON.parse(raw) as number[];
    return umi.eddsa.createKeypairFromSecretKey(new Uint8Array(arr));
  } catch {
    // Generate a fresh one and print it
    const fresh = generateSigner(umi);
    console.log("Generated fresh tree authority keypair:");
    console.log(`  pubkey:    ${fresh.publicKey}`);
    console.log(`  secret B58: ${bs58.encode(fresh.secretKey)}`);
    console.log("Save the secret to SETTLE_TREE_AUTHORITY_KEYPAIR_B58 in .env.local before continuing.");
    process.exit(1);
  }
}

async function main() {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  console.log(`Settle cNFT setup · ${cluster}`);
  console.log("─────────────────────────────────────────────");

  const umi = createUmi(getRpcUrl()).use(mplBubblegum()).use(mplTokenMetadata());

  // 1. Load tree authority keypair
  const authority = await loadOrCreateAuthority(umi);
  umi.use(keypairIdentity(authority));

  console.log(`✓ Authority: ${authority.publicKey}`);

  // 2. Check balance + airdrop if needed (devnet only)
  const balance = await umi.rpc.getBalance(authority.publicKey);
  const balanceSol = Number(balance.basisPoints) / 1_000_000_000;
  console.log(`✓ Balance: ${balanceSol} SOL`);

  if (cluster === "devnet" && balanceSol < 5) {
    console.log(`Airdropping 2 SOL…`);
    await umi.rpc.airdrop(authority.publicKey, sol(2));
  }

  // 3. Create Token Metadata collection NFT (parent for cNFTs)
  const collectionMint = generateSigner(umi);
  console.log(`Creating collection NFT: ${collectionMint.publicKey}…`);

  await createNft(umi, {
    mint: collectionMint,
    name: "Settle Receipts",
    symbol: "SETTLE",
    uri: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/cnft/collection.json`,
    sellerFeeBasisPoints: percentAmount(0),
    isCollection: true,
    creators: none(),
  }).sendAndConfirm(umi);

  console.log(`✓ Collection: ${collectionMint.publicKey}`);

  // 4. Create Bubblegum V1 concurrent merkle tree
  // Tree depth 20 → 1M leaves; canopy 13 keeps proofs small enough for cross-program tx composition.
  // max_buffer_size 64 = up to 64 concurrent updates per slot (rare to need more for receipt minting).
  const merkleTree = generateSigner(umi);
  console.log(`Creating tree: ${merkleTree.publicKey} (depth=20, canopy=13, buffer=64)…`);

  const treeBuilder = await createTree(umi, {
    merkleTree,
    maxDepth: 20,
    maxBufferSize: 64,
    canopyDepth: 13,
    public: false, // only the tree authority (us) can mint
  });
  await treeBuilder.sendAndConfirm(umi);

  console.log(`✓ Tree: ${merkleTree.publicKey}`);

  // 5. Print env var summary
  console.log("");
  console.log("═════════════════════════════════════════════");
  console.log("Add to .env.local:");
  console.log("");
  console.log(`SETTLE_CNFT_TREE_PUBKEY=${merkleTree.publicKey}`);
  console.log(`SETTLE_CNFT_COLLECTION_PUBKEY=${collectionMint.publicKey}`);
  console.log(`SETTLE_TREE_AUTHORITY_KEYPAIR_B58=${bs58.encode(authority.secretKey)}`);
  console.log("");
  console.log(`Solscan tree: https://solscan.io/account/${merkleTree.publicKey}?cluster=${cluster}`);
  console.log(`Solscan collection: https://solscan.io/token/${collectionMint.publicKey}?cluster=${cluster}`);
}

void main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
