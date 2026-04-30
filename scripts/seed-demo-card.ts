#!/usr/bin/env tsx
/**
 * Seed-demo-card — sets up a complete authority/agent-separated demo on devnet.
 *
 * Custody model:
 *   AUTHORITY = a fresh "demo user" keypair (saved to .demo-user.json — NOT the
 *               facilitator). This is the human-equivalent role: the only key that
 *               can revoke the card or close the pact and reclaim funds.
 *   AGENT     = the facilitator key (the running x402 proxy). Signs spend_via_pact
 *               on the authority's behalf. Cannot move funds outside the pact's
 *               cap, allowlist, capability_hash, or expiry.
 *
 * The authority signs `create_card` and `open_pact`. After that, the agent can
 * autonomously call `spend_via_pact` until the cap is exhausted, the pact expires,
 * or the authority calls `close_pact` and reclaims unspent funds.
 *
 * If you want to use your own wallet as authority (instead of generating a fresh
 * demo-user keypair), set DEMO_USER_PRIVKEY in the env. Otherwise this script
 * generates one and saves to .demo-user.json so you can re-run idempotently.
 *
 * Required env:
 *   SETTLE_FACILITATOR_PRIVKEY     base58 64-byte secret (= agent_pubkey)
 *   NEXT_PUBLIC_RPC_URL            (or HELIUS_API_KEY)
 *   NEXT_PUBLIC_SETTLE_PROGRAM_ID  must equal the deployed program ID
 *   USDC_MINT                      defaults to devnet 4zMM...
 *   MERCHANT_PUBKEY_ARXIV_FETCH    plus TRANSLATE + SUMMARIZE — must be real pubkeys
 *
 * Optional env:
 *   DEMO_USER_PRIVKEY              base58 64-byte secret to use as authority
 *                                  (otherwise: fresh keypair → .demo-user.json)
 *   PACT_CAP_USDC                  default "0.50"
 *   PACT_EXPIRY_MINUTES            default 60
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import { config } from "dotenv";
import { blake3 } from "@noble/hashes/blake3";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildIxData,
  BorshWriter,
} from "../apps/web/lib/borsh.js";

config({ path: ".env.local" });
config();

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ ${name} is required.`);
    process.exit(1);
  }
  return v;
}

function requirePubkey(name: string): PublicKey {
  const raw = requireEnv(name);
  try {
    return new PublicKey(raw);
  } catch {
    console.error(`❌ ${name}=${raw} is not a valid base58 32-byte pubkey.`);
    process.exit(1);
  }
}

function labelHashBytes(label: string): Buffer {
  return Buffer.from(blake3(new TextEncoder().encode(label)));
}

function findAgentCardPda(programId: PublicKey, authority: PublicKey, labelHash: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent-card"), authority.toBuffer(), labelHash],
    programId,
  )[0];
}

function findPactPda(programId: PublicKey, parentCard: PublicKey, scopeLabelHash: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pact"), parentCard.toBuffer(), scopeLabelHash],
    programId,
  )[0];
}

function findVaultPda(programId: PublicKey, pact: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pact-vault"), pact.toBuffer()],
    programId,
  )[0];
}

/** Load or generate the demo user (authority). Saves to .demo-user.json for idempotency. */
function loadOrCreateDemoUser(): Keypair {
  const fromEnv = process.env.DEMO_USER_PRIVKEY;
  if (fromEnv) {
    try {
      return Keypair.fromSecretKey(bs58.decode(fromEnv));
    } catch {
      console.error("❌ DEMO_USER_PRIVKEY is not a valid base58 64-byte secret.");
      process.exit(1);
    }
  }
  const path = resolve(process.cwd(), ".demo-user.json");
  if (existsSync(path)) {
    const json = JSON.parse(readFileSync(path, "utf8")) as { secret_b58: string };
    return Keypair.fromSecretKey(bs58.decode(json.secret_b58));
  }
  const fresh = Keypair.generate();
  writeFileSync(
    path,
    JSON.stringify(
      { pubkey: fresh.publicKey.toBase58(), secret_b58: bs58.encode(fresh.secretKey) },
      null,
      2,
    ),
  );
  console.log(`Generated fresh demo user → saved to ${path}`);
  return fresh;
}

async function main() {
  const rpcUrl = getRpcUrl();
  const facilitatorB58 = requireEnv("SETTLE_FACILITATOR_PRIVKEY");
  const programIdRaw = requireEnv("NEXT_PUBLIC_SETTLE_PROGRAM_ID");
  if (programIdRaw === "SettLe1111111111111111111111111111111111111") {
    console.error(
      "❌ NEXT_PUBLIC_SETTLE_PROGRAM_ID is the placeholder. Run `pnpm deploy:devnet` first.",
    );
    process.exit(1);
  }
  const programId = new PublicKey(programIdRaw);

  const usdcMint = new PublicKey(
    process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  );

  const merchants = [
    requirePubkey("MERCHANT_PUBKEY_ARXIV_FETCH"),
    requirePubkey("MERCHANT_PUBKEY_TRANSLATE"),
    requirePubkey("MERCHANT_PUBKEY_SUMMARIZE"),
  ];

  const capUsdc = process.env.PACT_CAP_USDC ?? "0.50";
  const expiryMinutes = Number(process.env.PACT_EXPIRY_MINUTES ?? 60);

  // Two SEPARATE keypairs:
  //   facilitator = AGENT (signs spend_via_pact)
  //   demoUser    = AUTHORITY (signs create_card + open_pact, can close_pact)
  const facilitator = Keypair.fromSecretKey(bs58.decode(facilitatorB58));
  const demoUser = loadOrCreateDemoUser();

  console.log("══════════════════════════════════════════════════════════════════");
  console.log(" Custody-separated demo setup");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`Authority (user)  : ${demoUser.publicKey.toBase58()}`);
  console.log(`Agent (facilitator): ${facilitator.publicKey.toBase58()}`);
  console.log(`Program ID         : ${programId.toBase58()}`);
  console.log(`USDC mint          : ${usdcMint.toBase58()}`);

  if (demoUser.publicKey.equals(facilitator.publicKey)) {
    console.error(
      "❌ DEMO_USER_PRIVKEY equals SETTLE_FACILITATOR_PRIVKEY. They MUST be different keys for the demo to be a real authority/agent separation.",
    );
    process.exit(1);
  }

  const conn = new Connection(rpcUrl, "confirmed");

  // Both demoUser and facilitator need SOL for rent + tx fees
  for (const [name, kp] of [
    ["demoUser", demoUser],
    ["facilitator", facilitator],
  ] as const) {
    const balance = await conn.getBalance(kp.publicKey, "confirmed");
    console.log(`${name} SOL balance  : ${balance / 1e9}`);
    if (balance < 0.05 * 1e9) {
      console.error(
        `❌ Need ≥ 0.05 SOL on ${name}. Run: solana airdrop 1 ${kp.publicKey.toBase58()} --url devnet`,
      );
      process.exit(1);
    }
  }

  // 1. create_card — authority = demoUser, agent_pubkey = facilitator
  const labelHash = labelHashBytes("demo-card");
  const cardPda = findAgentCardPda(programId, demoUser.publicKey, labelHash);
  console.log(`Card PDA           : ${cardPda.toBase58()}`);

  const existing = await conn.getAccountInfo(cardPda, "confirmed");
  if (!existing) {
    const dailyCap = BigInt(5 * 1_000_000); // $5 daily
    const perCallMax = BigInt(2 * 1_000_000); // $2 per call
    const slot = await conn.getSlot("confirmed");
    const expirySlot = BigInt(slot + 30 * 86_400 * 25); // ~30 days
    const policyVersion = 1;

    const createCardData = buildIxData("create_card", (w: BorshWriter) => {
      w.fixedBytes(facilitator.publicKey.toBuffer(), 32); // agent_pubkey
      w.fixedBytes(labelHash, 32);
      w.u64(dailyCap);
      w.u64(perCallMax);
      w.u32(merchants.length);
      for (const m of merchants) {
        w.fixedBytes(m.toBuffer(), 32);
        w.u8(0); // None capability_hash
      }
      w.u64(expirySlot);
      w.u32(policyVersion);
    });

    const createCardIx = {
      programId,
      keys: [
        { pubkey: demoUser.publicKey, isSigner: true, isWritable: true },
        { pubkey: cardPda, isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: createCardData,
    };

    const tx = new Transaction().add(createCardIx);
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = demoUser.publicKey;
    tx.sign(demoUser);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    console.log(`✓ create_card sig  : ${sig}`);
  } else {
    console.log("✓ card already exists, skipping create_card");
  }

  // 2. open_pact — funds vault from demoUser's USDC ATA
  const scopeHash = labelHashBytes(`demo-pact-${Date.now()}`);
  const pactPda = findPactPda(programId, cardPda, scopeHash);
  const vaultPda = findVaultPda(programId, pactPda);
  console.log(`Pact PDA           : ${pactPda.toBase58()}`);
  console.log(`Vault PDA          : ${vaultPda.toBase58()}`);

  const userUsdc = await getAssociatedTokenAddress(usdcMint, demoUser.publicKey);
  const vaultUsdc = await getAssociatedTokenAddress(usdcMint, vaultPda, true);

  let userBalance = 0n;
  try {
    const acc = await getAccount(conn, userUsdc);
    userBalance = BigInt(acc.amount.toString());
  } catch {
    console.warn(`⚠ demoUser's USDC ATA does not exist yet at ${userUsdc.toBase58()}.`);
  }
  const capLamports = BigInt(Math.round(parseFloat(capUsdc) * 1_000_000));
  if (userBalance < capLamports) {
    console.error(
      `❌ demoUser USDC balance (${userBalance}) < cap (${capLamports}). ` +
        `Mint test USDC to ${userUsdc.toBase58()} first.`,
    );
    process.exit(1);
  }

  const slot2 = await conn.getSlot("confirmed");
  const pactExpirySlot = BigInt(slot2 + expiryMinutes * 150);

  const openPactData = buildIxData("open_pact", (w: BorshWriter) => {
    w.fixedBytes(scopeHash, 32);
    w.u64(capLamports);
    w.u32(merchants.length);
    for (const m of merchants) {
      w.fixedBytes(m.toBuffer(), 32);
      w.u8(0);
    }
    w.u64(pactExpirySlot);
  });

  const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const ASSOC_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

  const openPactIx = {
    programId,
    keys: [
      { pubkey: demoUser.publicKey, isSigner: true, isWritable: true },
      { pubkey: cardPda, isSigner: false, isWritable: false },
      { pubkey: pactPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: false },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: userUsdc, isSigner: false, isWritable: true },
      { pubkey: vaultUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOC_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: openPactData,
  };

  const tx2 = new Transaction().add(openPactIx);
  const { blockhash: bh2 } = await conn.getLatestBlockhash("confirmed");
  tx2.recentBlockhash = bh2;
  tx2.feePayer = demoUser.publicKey;
  tx2.sign(demoUser);
  const sig2 = await conn.sendRawTransaction(tx2.serialize());
  await conn.confirmTransaction(sig2, "confirmed");
  console.log(`✓ open_pact sig    : ${sig2}`);

  // ────────────────────────────────────────────────────────────────────────
  // 2b. open_streaming_pact — seeds a Streaming Pact for the /agents/streaming demo.
  //     Skip via SKIP_STREAMING=1.
  // ────────────────────────────────────────────────────────────────────────
  let streamingPactPda: PublicKey | null = null;
  if (!process.env.SKIP_STREAMING) {
    const streamScopeHash = labelHashBytes(`demo-stream-${Date.now()}`);
    streamingPactPda = findPactPda(programId, cardPda, streamScopeHash);
    const streamVaultPda = findVaultPda(programId, streamingPactPda);
    const streamVaultUsdc = await getAssociatedTokenAddress(usdcMint, streamVaultPda, true);

    // ~$0.10/min @ ~150 slots/min = 666 lamports/slot. Max $0.50 budget.
    const ratePerSlot = BigInt(666);
    const maxTotal = BigInt(500_000); // $0.50 USDC base units

    if (userBalance < capLamports + maxTotal) {
      console.warn(
        `⚠ Skipping streaming pact: user USDC balance (${userBalance}) < oneshot cap + streaming max (${capLamports + maxTotal}).`,
      );
      streamingPactPda = null;
    } else {
      const streamExpirySlot = BigInt(slot2 + 30 * 86_400 * 25); // ~30 days

      const openStreamData = buildIxData("open_streaming_pact", (w: BorshWriter) => {
        w.fixedBytes(streamScopeHash, 32);
        w.u64(ratePerSlot);
        w.u64(maxTotal);
        w.u32(1); // allowlist count — single merchant
        w.fixedBytes(merchants[0]!.toBuffer(), 32);
        w.u8(0); // None capability_hash
        w.u64(streamExpirySlot);
      });

      const openStreamIx = {
        programId,
        keys: [
          { pubkey: demoUser.publicKey, isSigner: true, isWritable: true },
          { pubkey: cardPda, isSigner: false, isWritable: false },
          { pubkey: streamingPactPda, isSigner: false, isWritable: true },
          { pubkey: streamVaultPda, isSigner: false, isWritable: false },
          { pubkey: usdcMint, isSigner: false, isWritable: false },
          { pubkey: userUsdc, isSigner: false, isWritable: true },
          { pubkey: streamVaultUsdc, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOC_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: openStreamData,
      };

      const tx3 = new Transaction().add(openStreamIx);
      const { blockhash: bh3 } = await conn.getLatestBlockhash("confirmed");
      tx3.recentBlockhash = bh3;
      tx3.feePayer = demoUser.publicKey;
      tx3.sign(demoUser);
      try {
        const sig3 = await conn.sendRawTransaction(tx3.serialize());
        await conn.confirmTransaction(sig3, "confirmed");
        console.log(`✓ open_streaming_pact sig: ${sig3}`);
        console.log(
          `  → /agents/streaming will show this stream at ${streamingPactPda.toBase58()}`,
        );
      } catch (e) {
        console.warn(`⚠ open_streaming_pact failed: ${(e as Error).message}`);
        streamingPactPda = null;
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 2c. open_delivery_escrow — seeds a DeliveryEscrow Pact for the F22 demo.
  //     Skip via SKIP_ESCROW=1.
  // ────────────────────────────────────────────────────────────────────────
  let escrowPactPda: PublicKey | null = null;
  if (!process.env.SKIP_ESCROW) {
    const escrowScopeHash = labelHashBytes(`demo-escrow-${Date.now()}`);
    escrowPactPda = findPactPda(programId, cardPda, escrowScopeHash);
    const escrowVaultPda = findVaultPda(programId, escrowPactPda);
    const escrowVaultUsdc = await getAssociatedTokenAddress(usdcMint, escrowVaultPda, true);

    const escrowAmount = BigInt(200_000); // $0.20 USDC for demo
    const escrowMerchant = merchants[1]!; // use translate merchant for variety

    // 7-day windows: ~150 slots/min × 60 min × 24 h × 7 days = 1,512,000 slots
    const slot3 = await conn.getSlot("confirmed");
    const sevenDaysSlots = BigInt(7 * 24 * 60 * 150);
    const confirmDeadlineSlot = BigInt(slot3) + sevenDaysSlots;
    const disputeDeadlineSlot = confirmDeadlineSlot;
    const escrowExpirySlot = BigInt(slot3 + 30 * 86_400 * 25); // ~30 days

    if (userBalance < capLamports + (process.env.SKIP_STREAMING ? 0n : 500_000n) + escrowAmount) {
      console.warn(
        `⚠ Skipping escrow pact: user USDC balance too low (need ${capLamports + 500_000n + escrowAmount}).`,
      );
      escrowPactPda = null;
    } else {
      // capability_hash for the demo: BLAKE3("demo-delivery-capability") — placeholder
      const capabilityHash = Buffer.from(
        blake3(new TextEncoder().encode("demo-delivery-capability")),
      );

      const openEscrowData = buildIxData("open_delivery_escrow", (w: BorshWriter) => {
        w.fixedBytes(escrowScopeHash, 32);
        w.u64(escrowAmount);
        w.fixedBytes(escrowMerchant.toBuffer(), 32);
        w.fixedBytes(capabilityHash, 32);
        w.u64(confirmDeadlineSlot);
        w.u64(disputeDeadlineSlot);
        w.u64(escrowExpirySlot);
      });

      const openEscrowIx = {
        programId,
        keys: [
          { pubkey: demoUser.publicKey, isSigner: true, isWritable: true },
          { pubkey: cardPda, isSigner: false, isWritable: false },
          { pubkey: escrowPactPda, isSigner: false, isWritable: true },
          { pubkey: escrowVaultPda, isSigner: false, isWritable: false },
          { pubkey: usdcMint, isSigner: false, isWritable: false },
          { pubkey: userUsdc, isSigner: false, isWritable: true },
          { pubkey: escrowVaultUsdc, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOC_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: openEscrowData,
      };

      const tx4 = new Transaction().add(openEscrowIx);
      const { blockhash: bh4 } = await conn.getLatestBlockhash("confirmed");
      tx4.recentBlockhash = bh4;
      tx4.feePayer = demoUser.publicKey;
      tx4.sign(demoUser);
      try {
        const sig4 = await conn.sendRawTransaction(tx4.serialize());
        await conn.confirmTransaction(sig4, "confirmed");
        console.log(`✓ open_delivery_escrow sig: ${sig4}`);
        console.log(
          `  → escrow ${escrowPactPda.toBase58()} held until buyer confirms or disputes`,
        );
      } catch (e) {
        console.warn(`⚠ open_delivery_escrow failed: ${(e as Error).message}`);
        escrowPactPda = null;
      }
    }
  }

  // 3. Build settle:// envelope. Authority (demoUser) signs the envelope; agent
  // (facilitator) holds the per-request signing key.
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
  const envelope = {
    v: 1,
    card: cardPda.toBase58(),
    agent_pubkey: facilitator.publicKey.toBase58(),
    expires_at: expiresAt,
    capabilities: [],
  };

  const sorted = Object.fromEntries(Object.entries(envelope).sort(([a], [b]) => a.localeCompare(b)));
  const envBytes = new TextEncoder().encode(JSON.stringify(sorted));
  const { ed25519 } = await import("@noble/curves/ed25519");
  // Authority signs the envelope (demoUser, NOT facilitator)
  const sig = ed25519.sign(envBytes, demoUser.secretKey.slice(0, 32));
  const finalEnvelope = { ...envelope, authority_sig: bs58.encode(sig) };
  const settleUri =
    "settle://" +
    Buffer.from(JSON.stringify(finalEnvelope))
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(" Demo wired with authority/agent separation. Add to apps/demo-agent/.env:");
  console.log("══════════════════════════════════════════════════════════════════\n");
  console.log(`SETTLE_FACILITATOR_URL=http://localhost:3000`);
  console.log(`SETTLE_CREDENTIAL=${settleUri}`);
  console.log(`SETTLE_AGENT_PRIVKEY=${facilitatorB58}`);
  console.log(`SETTLE_PACT_PUBKEY=${pactPda.toBase58()}`);
  console.log("");
  console.log("Demo pacts seeded:");
  console.log(`  OneShot         : ${pactPda.toBase58()} ($${capUsdc} cap)`);
  if (streamingPactPda) {
    console.log(`  Streaming       : ${streamingPactPda.toBase58()} ($0.10/min, $0.50 max)`);
    console.log(`                    → /agents/streaming live monitor`);
  }
  if (escrowPactPda) {
    console.log(`  DeliveryEscrow  : ${escrowPactPda.toBase58()} ($0.20 held, 7-day window)`);
    console.log(`                    → /receipts/<requestId> shows EscrowState surface`);
  }
  console.log("\nThen: pnpm dev:agent");
  console.log("");
  console.log("Custody check: only the demo-user keypair (saved to .demo-user.json) can");
  console.log("call close_pact and reclaim unspent USDC. The facilitator key can ONLY");
  console.log("trigger spend_via_pact within the pact's cap + allowlist + capability.\n");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
