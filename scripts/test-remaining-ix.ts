#!/usr/bin/env tsx
/**
 * Wave-6 autonomous test runner — fire the 7 Anchor ix that hadn't been
 * exercised on devnet yet, in dependency order:
 *
 *   1. pause_streaming   (on the streaming pact opened by seed-demo-card)
 *   2. resume_streaming
 *   3. claim_streaming   (claim accrued entitlement to BOB)
 *   4. close_pact        (close ALICE's most-recent OneShot pact, refund vault)
 *   5. revoke            (revoke ALICE's most-recent card)
 *   6. release_delivery_escrow  (buyer-confirmed release on the escrow pact)
 *   7. dispute_delivery_escrow  (intentionally on a different pact, or
 *                                 skipped if only one escrow exists)
 *
 * Each step is best-effort: if one fails, we keep going and report.
 */

import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

const PROGRAM_ID = new PublicKey("HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD");
const USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

function disc(name: string): Buffer {
  return createHash("sha256").update("global:" + name).digest().subarray(0, 8);
}

function loadKp(path: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))),
  );
}

interface Pact {
  pact_pubkey: string;
  parent_card: string;
  authority: string;
  agent_pubkey: string;
  scope_label_hash: string;
  mode: string;
  closed: boolean;
  paused?: boolean;
  released?: boolean;
  refunded?: boolean;
}

async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const alice = loadKp(".test-wallet.json");

  // The "agent" for spend_via_pact / claim_streaming defaults to the
  // facilitator pubkey when seed-demo-card runs. Use the SETTLE_FACILITATOR
  // privkey to sign as agent.
  const facilitatorPriv = process.env.SETTLE_FACILITATOR_PRIVKEY;
  if (!facilitatorPriv) throw new Error("SETTLE_FACILITATOR_PRIVKEY env not set");
  // bs58 → bytes
  const bs58 = await import("bs58");
  const decode = (bs58 as any).default?.decode ?? (bs58 as any).decode;
  const agent = Keypair.fromSecretKey(decode(facilitatorPriv));

  console.log("alice:", alice.publicKey.toBase58());
  console.log("agent:", agent.publicKey.toBase58());

  // Look up state from Supabase. The streaming + escrow pacts were just
  // created by seed-demo-card.ts; the indexer may not have caught them yet,
  // so fall back to known PDAs from the seed run.
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Hard-coded PDAs from the most recent seed-demo-card run (scripts/seed-demo-card.ts)
  // These are the pacts we want to exercise:
  const STREAMING_PACT = new PublicKey("9tqwgWNRjx5vVZSJFZS85BTawhQuhvFmAZQq1SEpo7aa");
  const ESCROW_PACT = new PublicKey("DftWQG19uJMkz4sMXZnSuyZMF2rJ5fa4BVrwgpFhqEyx");

  // Fetch parent card for the streaming pact
  const { data: pactData } = await sb
    .from("pacts")
    .select("*")
    .in("pact_pubkey", [STREAMING_PACT.toBase58(), ESCROW_PACT.toBase58()]);
  console.log("found in DB:", pactData?.length ?? 0, "pacts");

  // Pick the most recent OneShot pact owned by ALICE — pacts table has no
  // authority column directly, so join via agent_cards.authority_pubkey.
  const { data: aliceCards } = await sb
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", alice.publicKey.toBase58());
  const cardPubs = (aliceCards ?? []).map((c) => c.card_pubkey as string);
  // Skip pacts we've already closed in prior runs (DB lags). Pick the
  // 2nd-most-recent oneshot to dodge the just-closed one.
  const { data: oneshots } = await sb
    .from("pacts")
    .select("pact_pubkey,parent_card,closed,scope_label_hash")
    .in("parent_card", cardPubs.length > 0 ? cardPubs : ["__none__"])
    .eq("closed", false)
    .eq("mode", "oneshot")
    .order("created_at", { ascending: false })
    .limit(5);
  const oneshot = oneshots?.[1] as Pact | undefined;
  if (oneshot) {
    console.log("OneShot pact to close:", oneshot.pact_pubkey);
  }

  const merchant = new PublicKey("Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB");

  const results: Array<[string, "ok" | "fail" | "skip", string]> = [];

  // ─────────────────────────────────────────────
  // 1. pause_streaming
  // ─────────────────────────────────────────────
  try {
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      data: disc("pause_streaming"),
      keys: [
        { pubkey: alice.publicKey, isSigner: true, isWritable: true },
        { pubkey: STREAMING_PACT, isSigner: false, isWritable: true },
      ],
    });
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [alice], { commitment: "confirmed" });
    results.push(["pause_streaming", "ok", sig]);
    console.log(`✓ pause_streaming sig: ${sig}`);
  } catch (e: any) {
    results.push(["pause_streaming", "fail", String(e.message ?? e).slice(0, 200)]);
    console.log(`✗ pause_streaming: ${e.message ?? e}`);
  }

  // ─────────────────────────────────────────────
  // 2. resume_streaming
  // ─────────────────────────────────────────────
  try {
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      data: disc("resume_streaming"),
      keys: [
        { pubkey: alice.publicKey, isSigner: true, isWritable: true },
        { pubkey: STREAMING_PACT, isSigner: false, isWritable: true },
      ],
    });
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [alice], { commitment: "confirmed" });
    results.push(["resume_streaming", "ok", sig]);
    console.log(`✓ resume_streaming sig: ${sig}`);
  } catch (e: any) {
    results.push(["resume_streaming", "fail", String(e.message ?? e).slice(0, 200)]);
    console.log(`✗ resume_streaming: ${e.message ?? e}`);
  }

  // ─────────────────────────────────────────────
  // 3. claim_streaming (agent claims accrued entitlement to BOB)
  // Args: capability_hash, receipt_hash, reason_hash, policy_snapshot_hash
  // (each is [u8; 32]). For coverage purposes use zero hashes.
  // ─────────────────────────────────────────────
  try {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), STREAMING_PACT.toBuffer()],
      PROGRAM_ID,
    );
    const vaultUsdc = await getAssociatedTokenAddress(USDC, vault, true);
    const merchantUsdc = await getAssociatedTokenAddress(USDC, merchant);

    // Card PDA from seed-demo-card.ts most-recent run (streaming pact's parent)
    const cardPub = new PublicKey("3k3c4wSnVCuWnFpBrtrcjCXJXp5RwUWZNVGnfVD1AW2e");

    const ZERO = Buffer.alloc(32);
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      data: Buffer.concat([disc("claim_streaming"), ZERO, ZERO, ZERO, ZERO]),
      keys: [
        { pubkey: agent.publicKey, isSigner: true, isWritable: false }, // agent
        { pubkey: agent.publicKey, isSigner: true, isWritable: true }, // fee_payer
        { pubkey: cardPub, isSigner: false, isWritable: true },
        { pubkey: STREAMING_PACT, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: false },
        { pubkey: USDC, isSigner: false, isWritable: false },
        { pubkey: vaultUsdc, isSigner: false, isWritable: true },
        { pubkey: merchantUsdc, isSigner: false, isWritable: true },
        { pubkey: merchant, isSigner: false, isWritable: false }, // merchant_owner
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
    });
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [agent], { commitment: "confirmed" });
    results.push(["claim_streaming", "ok", sig]);
    console.log(`✓ claim_streaming sig: ${sig}`);
  } catch (e: any) {
    results.push(["claim_streaming", "fail", String(e.message ?? e).slice(0, 200)]);
    console.log(`✗ claim_streaming: ${(e.message ?? e).slice(0, 300)}`);
    if (e.logs) console.log("  logs:", e.logs.slice(0, 8).join("\n         "));
  }

  // ─────────────────────────────────────────────
  // 4. close_pact (close OneShot + refund vault)
  // ─────────────────────────────────────────────
  if (oneshot) {
    const pact = new PublicKey(oneshot.pact_pubkey);
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), pact.toBuffer()],
      PROGRAM_ID,
    );
    const vaultUsdc = await getAssociatedTokenAddress(USDC, vault, true);
    const aliceUsdc = await getAssociatedTokenAddress(USDC, alice.publicKey);
    try {
      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        data: disc("close_pact"),
        keys: [
          { pubkey: alice.publicKey, isSigner: true, isWritable: true },
          { pubkey: pact, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: false },
          { pubkey: USDC, isSigner: false, isWritable: false },
          { pubkey: vaultUsdc, isSigner: false, isWritable: true },
          { pubkey: aliceUsdc, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
      });
      const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [alice], { commitment: "confirmed" });
      results.push(["close_pact", "ok", sig]);
      console.log(`✓ close_pact sig: ${sig}`);
    } catch (e: any) {
      results.push(["close_pact", "fail", String(e.message ?? e).slice(0, 200)]);
      console.log(`✗ close_pact: ${e.message ?? e}`);
    }
  } else {
    results.push(["close_pact", "skip", "no open OneShot pact for ALICE"]);
  }

  // ─────────────────────────────────────────────
  // 5. revoke (most recent card owned by ALICE)
  // ─────────────────────────────────────────────
  const { data: cards } = await sb
    .from("agent_cards")
    .select("card_pubkey,authority_pubkey,revoked,label_hash")
    .eq("authority_pubkey", alice.publicKey.toBase58())
    .eq("revoked", false)
    .order("created_at", { ascending: false })
    .limit(1);
  const card = cards?.[0];
  if (card) {
    try {
      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        data: disc("revoke"),
        keys: [
          { pubkey: alice.publicKey, isSigner: true, isWritable: true },
          { pubkey: new PublicKey(card.card_pubkey), isSigner: false, isWritable: true },
        ],
      });
      const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [alice], { commitment: "confirmed" });
      results.push(["revoke", "ok", sig]);
      console.log(`✓ revoke sig: ${sig}`);
    } catch (e: any) {
      results.push(["revoke", "fail", String(e.message ?? e).slice(0, 200)]);
      console.log(`✗ revoke: ${e.message ?? e}`);
    }
  } else {
    results.push(["revoke", "skip", "no active card for ALICE"]);
  }

  // ─────────────────────────────────────────────
  // 6. release_delivery_escrow (buyer-confirmed release path)
  //   - caller = ALICE (= pact.authority)
  //   - merchant_usdc owner must equal pact.merchant (pinned at open time)
  // ─────────────────────────────────────────────
  try {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), ESCROW_PACT.toBuffer()],
      PROGRAM_ID,
    );
    const vaultUsdc = await getAssociatedTokenAddress(USDC, vault, true);
    const merchantUsdc = await getAssociatedTokenAddress(USDC, merchant);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      data: disc("release_delivery_escrow"),
      keys: [
        { pubkey: alice.publicKey, isSigner: true, isWritable: true }, // caller (buyer)
        { pubkey: ESCROW_PACT, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: false },
        { pubkey: USDC, isSigner: false, isWritable: false },
        { pubkey: vaultUsdc, isSigner: false, isWritable: true },
        { pubkey: merchantUsdc, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
    });
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [alice], { commitment: "confirmed" });
    results.push(["release_delivery_escrow", "ok", sig]);
    console.log(`✓ release_delivery_escrow sig: ${sig}`);
  } catch (e: any) {
    results.push(["release_delivery_escrow", "fail", String(e.message ?? e).slice(0, 200)]);
    console.log(`✗ release_delivery_escrow: ${(e.message ?? e).slice(0, 300)}`);
    if (e.logs) console.log("  logs:", e.logs.slice(0, 8).join("\n         "));
  }

  // ─────────────────────────────────────────────
  // 7. dispute_delivery_escrow (fresh escrow refund-to-buyer)
  //   - authority = ALICE (= pact.authority)
  //   - escrow must NOT be released/refunded yet
  // ─────────────────────────────────────────────
  const FRESH_ESCROW = process.env.FRESH_ESCROW_PACT;
  if (FRESH_ESCROW) {
    try {
      const escrowPact = new PublicKey(FRESH_ESCROW);
      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("pact-vault"), escrowPact.toBuffer()],
        PROGRAM_ID,
      );
      const vaultUsdc = await getAssociatedTokenAddress(USDC, vault, true);
      const aliceUsdc = await getAssociatedTokenAddress(USDC, alice.publicKey);

      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        data: disc("dispute_delivery_escrow"),
        keys: [
          { pubkey: alice.publicKey, isSigner: true, isWritable: true }, // authority (buyer)
          { pubkey: escrowPact, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: false },
          { pubkey: USDC, isSigner: false, isWritable: false },
          { pubkey: vaultUsdc, isSigner: false, isWritable: true },
          { pubkey: aliceUsdc, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
      });
      const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [alice], { commitment: "confirmed" });
      results.push(["dispute_delivery_escrow", "ok", sig]);
      console.log(`✓ dispute_delivery_escrow sig: ${sig}`);
    } catch (e: any) {
      results.push(["dispute_delivery_escrow", "fail", String(e.message ?? e).slice(0, 200)]);
      console.log(`✗ dispute_delivery_escrow: ${(e.message ?? e).slice(0, 300)}`);
      if (e.logs) console.log("  logs:", e.logs.slice(0, 8).join("\n         "));
    }
  } else {
    results.push(["dispute_delivery_escrow", "skip", "no FRESH_ESCROW_PACT in env"]);
  }

  console.log("\n=== Summary ===");
  for (const [name, status, info] of results) {
    console.log(`${status === "ok" ? "✓" : status === "skip" ? "—" : "✗"} ${name.padEnd(28)} ${info.slice(0, 80)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
