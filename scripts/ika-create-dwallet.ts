#!/usr/bin/env bun
// One-shot DKG helper for Settle x Ika sidetrack.
//
// Creates a real dWallet on Ika devnet via gRPC, transfers its authority to
// `settle-dwallet-router`'s CPI authority PDA, and dumps the resulting
// dWallet identity (pubkey + signing public key + bumps) as JSON for our
// repo to use.
//
// Status as of v0.4 close: the script compiles and reaches the Ika gRPC
// SubmitTransaction call. The HTTP/2 handshake to
// pre-alpha-dev-1.ika.ika-network.net:443 fails consistently with
// NGHTTP2_PROTOCOL_ERROR from both Node 20+ and Bun 1.3 (Windows + WSL).
// Direct TLS probe (curl -v) confirms the service is reachable; the issue
// is HTTP/2 ALPN handshake compatibility between current grpc-js and the
// nginx fronting the pre-alpha service. Documented in IKA-PROGRESS.md §F.7.
//
// When Ika resolves the pre-alpha gRPC runtime compatibility (or v0.5
// ships our own @connectrpc/connect-web client), this script runs as-is.
//
// Requires: ../../resources/identity/ika-pre-alpha cloned + `_shared` deps
// installed (cd there && bun install). Imports Ika's reference helper
// directly so any fix Ika makes upstream lands here on a re-run.
//
// Usage (from this directory):
//   bun settle-create-dwallet.ts [DWALLET_PROGRAM_ID] [SETTLE_ROUTER_PROGRAM_ID]
//
// Defaults:
//   DWALLET_PROGRAM_ID = 87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY
//   SETTLE_ROUTER     = FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK
//
// Env:
//   RPC_URL           — Solana RPC (default devnet)
//   GRPC_URL          — Ika gRPC (default pre-alpha-dev-1.ika.ika-network.net:443)
//   PAYER_KEYPAIR     — path to the deployer keypair (default ~/.config/solana/id.json)
//   OUTPUT_PATH       — where to write the JSON (default ./settle-dwallet.json)

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// Import Ika's reference DKG helper directly. Path is relative to the
// settle-protocol repo root (where this script lives under `scripts/`).
import { setupDWallet } from "../../resources/identity/ika-pre-alpha/chains/solana/examples/_shared/ika-setup.ts";

const args = process.argv.slice(2);
const DWALLET_PROGRAM = new PublicKey(
  args[0] ?? "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY",
);
const ROUTER_PROGRAM = new PublicKey(
  args[1] ?? "FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK",
);
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const GRPC_URL = process.env.GRPC_URL ?? "pre-alpha-dev-1.ika.ika-network.net:443";
const PAYER_KEYPAIR_PATH =
  process.env.PAYER_KEYPAIR ?? join(homedir(), ".config", "solana", "id.json");
const OUTPUT_PATH = process.env.OUTPUT_PATH ?? "./settle-dwallet.json";

console.log("─── Settle × Ika · one-shot DKG ─────────────────────────");
console.log("dWallet program:", DWALLET_PROGRAM.toBase58());
console.log("Router program: ", ROUTER_PROGRAM.toBase58());
console.log("RPC:            ", RPC_URL);
console.log("gRPC:           ", GRPC_URL);
console.log("Payer keypair:  ", PAYER_KEYPAIR_PATH);
console.log();

const connection = new Connection(RPC_URL, "confirmed");

// Load the user's existing devnet wallet (4+ SOL on devnet expected).
const secret = JSON.parse(readFileSync(PAYER_KEYPAIR_PATH, "utf8")) as number[];
const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
console.log("Payer:", payer.publicKey.toBase58());

const balance = await connection.getBalance(payer.publicKey, "confirmed");
console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);
if (balance < 1_000_000_000) {
  console.error("ERROR: payer has < 1 SOL. Airdrop devnet SOL first.");
  process.exit(1);
}

console.log("\nRunning Ika DKG via gRPC (this can take 30–90s in pre-alpha)…\n");

let setup;
try {
  setup = await setupDWallet(connection, payer, DWALLET_PROGRAM, ROUTER_PROGRAM, GRPC_URL);
} catch (err) {
  console.error("\nDKG FAILED:", err instanceof Error ? err.message : err);
  console.error("Common causes:");
  console.error("  - Ika gRPC service is down (pre-alpha can have intermittent outages)");
  console.error("  - Payer ran out of SOL during the back-to-back gRPC + on-chain ops");
  console.error("  - Solana devnet rate-limited the deploy / write-back");
  process.exit(1);
}

const out = {
  dwallet_pubkey_b58: setup.dwalletPda.toBase58(),
  dwallet_address_hex: Buffer.from(setup.dwalletAddr).toString("hex"),
  dwallet_signing_pubkey_hex: Buffer.from(setup.publicKey).toString("hex"),
  cpi_authority_b58: setup.cpiAuthority.toBase58(),
  cpi_authority_bump: setup.cpiAuthorityBump,
  authority_payer_b58: payer.publicKey.toBase58(),
  // Curve discriminator the DKG used. setupDWallet hardcodes Curve25519 in
  // the pre-alpha helper (see ika-setup.ts). For Sepolia EVM signing the
  // dWallet must be Secp256k1; this is currently a known limitation in
  // Ika's reference helper. Documented honestly so the demo doesn't claim
  // EVM-compatible signing it can't deliver.
  curve_note: "Curve25519 (Ed25519) — produced by Ika's pre-alpha reference helper. Sufficient for Solana-side signing; NOT compatible with Sepolia EVM (which needs Secp256k1).",
  created_at: new Date().toISOString(),
};

writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
console.log("\n✓ DKG complete. Wrote", OUTPUT_PATH);
console.log("\nKey fields:");
console.log("  dwallet_pubkey_b58:        ", out.dwallet_pubkey_b58);
console.log("  cpi_authority_b58:         ", out.cpi_authority_b58);
console.log("  cpi_authority_bump:        ", out.cpi_authority_bump);
console.log("  signing pubkey (hex):      ", out.dwallet_signing_pubkey_hex.slice(0, 20) + "…");

console.log("\nUse this dWallet in /start/agent-crosschain (paste pubkey + hex key) and run:");
console.log(`  IKA_TEST_DWALLET=${out.dwallet_pubkey_b58} \\`);
console.log(`  IKA_TEST_DWALLET_PUBKEY_HEX=${out.dwallet_signing_pubkey_hex} \\`);
console.log("  pnpm tsx scripts/ika-roundtrip.ts --allow");
