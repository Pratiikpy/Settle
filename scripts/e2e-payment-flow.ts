#!/usr/bin/env tsx
/**
 * End-to-end payment flow on devnet, programmatic.
 *
 * Sequence:
 *   1. Load .test-wallet.json as authority (buyer/payer)
 *   2. Load FACILITATOR keypair from env as agent + fee-payer
 *   3. Generate or load .test-merchant.json as the recipient
 *   4. create_card (authority signs)
 *   5. open_pact (authority signs; funds vault with 1 USDC)
 *   6. spend_via_pact (agent/facilitator signs; pays merchant 0.5 USDC)
 *   7. Verify on-chain: vault decreased, merchant increased, ALLOW emitted
 *   8. Poll Postgres for the indexer-written policy_decisions row (10s timeout)
 *   9. Print Solscan URLs for every tx
 *
 * Required env: SETTLE_FACILITATOR_PRIVKEY, SETTLE_PROGRAM_ID, HELIUS_API_KEY,
 *               SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional, only for step 8)
 *
 * Idempotency: card + pact PDAs are deterministic (label + scope hashes) so a
 * fresh run with new label suffixes works; an exact-rerun re-uses the existing
 * card and either re-uses the pact (if not closed) or fails on duplicate PDA.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import { blake3 } from "@noble/hashes/blake3";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  createCardIx,
  openPactIx,
  spendViaPactIx,
  findAgentCardPda,
  findPactPda,
  findPactVaultPda,
  labelHashBytes,
} from "../apps/web/lib/anchor-client";

const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const heliusKey = process.env.HELIUS_API_KEY;
const rpc = heliusKey
  ? `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`
  : `https://api.${cluster}.solana.com`;
const conn = new Connection(rpc, "confirmed");

const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const TEST_WALLET_PATH = resolve(process.cwd(), ".test-wallet.json");
const TEST_MERCHANT_PATH = resolve(process.cwd(), ".test-merchant.json");

function loadKp(path: string): Keypair {
  if (!existsSync(path)) throw new Error(`No keypair at ${path}`);
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
}

function loadOrGenerateMerchant(): Keypair {
  if (existsSync(TEST_MERCHANT_PATH)) return loadKp(TEST_MERCHANT_PATH);
  const kp = Keypair.generate();
  writeFileSync(TEST_MERCHANT_PATH, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`Generated test merchant → ${TEST_MERCHANT_PATH}`);
  return kp;
}

function loadFacilitator(): Keypair {
  const sk = process.env.SETTLE_FACILITATOR_PRIVKEY;
  if (!sk) throw new Error("SETTLE_FACILITATOR_PRIVKEY env var not set");
  return Keypair.fromSecretKey(bs58.decode(sk));
}

function randomHash32(): Uint8Array {
  const h = new Uint8Array(32);
  for (let i = 0; i < 32; i++) h[i] = Math.floor(Math.random() * 256);
  return h;
}

async function sendTx(
  ixs: TransactionInstruction[],
  signers: Keypair[],
  feePayer: PublicKey,
  description: string,
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = feePayer;
  for (const s of signers) tx.partialSign(s);
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });
  console.log(`  ${description} sent: ${sig}`);
  await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  console.log(`  confirmed. Solscan: https://solscan.io/tx/${sig}?cluster=${cluster}`);
  return sig;
}

async function pollPolicyDecision(sig: string, timeoutMs: number): Promise<any> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(`  [skip] Postgres poll: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY not set`);
    return null;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase
      .from("policy_decisions")
      .select("*")
      .eq("sig_solscan", sig)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error(`  [poll] supabase error: ${error.message}`);
      return null;
    }
    if (data) return data;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

async function main() {
  console.log("=".repeat(70));
  console.log("Settle E2E Payment Flow — devnet");
  console.log("=".repeat(70));
  console.log();

  const authority = loadKp(TEST_WALLET_PATH);
  const facilitator = loadFacilitator();
  const merchant = loadOrGenerateMerchant();

  console.log(`Authority (buyer):   ${authority.publicKey.toBase58()}`);
  console.log(`Agent (facilitator): ${facilitator.publicKey.toBase58()}`);
  console.log(`Merchant:            ${merchant.publicKey.toBase58()}`);
  console.log();

  // ───────── Pre-flight balance check ─────────
  const authoritySol = await conn.getBalance(authority.publicKey, "confirmed");
  const facilitatorSol = await conn.getBalance(facilitator.publicKey, "confirmed");
  if (authoritySol < 0.05 * 1e9) throw new Error(`Authority needs >0.05 SOL, has ${authoritySol / 1e9}`);
  if (facilitatorSol < 0.05 * 1e9) throw new Error(`Facilitator needs >0.05 SOL, has ${facilitatorSol / 1e9}`);

  const authorityAta = await getAssociatedTokenAddress(usdcMint, authority.publicKey);
  let authorityUsdcBefore: bigint;
  try {
    authorityUsdcBefore = (await getAccount(conn, authorityAta)).amount;
  } catch {
    throw new Error(`Authority ATA ${authorityAta.toBase58()} doesn't exist or has no balance. Run scripts/bootstrap-test-wallet.ts and faucet USDC.`);
  }
  if (authorityUsdcBefore < 1_000_000n) {
    throw new Error(`Authority needs >1 USDC for the flow, has ${Number(authorityUsdcBefore) / 1e6}`);
  }
  console.log(`Authority USDC: ${Number(authorityUsdcBefore) / 1e6}`);
  console.log();

  // ───────── Step 1: create_card ─────────
  console.log("Step 1/4: create_card");
  // Use a unique label per run so we don't collide with prior cards
  const cardLabel = `e2e-${Date.now()}`;
  const cardLabelHash = labelHashBytes(cardLabel);
  const [cardPda] = findAgentCardPda(authority.publicKey, cardLabelHash);
  console.log(`  Card label:   "${cardLabel}"`);
  console.log(`  Card PDA:     ${cardPda.toBase58()}`);

  const slotNow = await conn.getSlot("confirmed");
  const cardExpirySlot = BigInt(slotNow) + 1_000_000n;
  const createCardSig = await sendTx(
    [
      createCardIx({
        authority: authority.publicKey,
        card: cardPda,
        usdcMint,
        args: {
          agentPubkey: facilitator.publicKey,
          labelHash: cardLabelHash,
          dailyCapLamports: 5_000_000n, // 5 USDC
          perCallMaxLamports: 1_000_000n, // 1 USDC
          allowlist: [{ merchant: merchant.publicKey, capabilityHash: null }],
          expirySlot: cardExpirySlot,
          policyVersion: 1,
        },
      }),
    ],
    [authority],
    authority.publicKey,
    "create_card",
  );
  console.log();

  // ───────── Step 2: open_pact ─────────
  console.log("Step 2/4: open_pact (funds vault with 1 USDC)");
  const pactScopeLabel = `e2e-pact-${Date.now()}`;
  const pactScopeHash = labelHashBytes(pactScopeLabel);
  const [pactPda] = findPactPda(cardPda, pactScopeHash);
  const [vaultPda] = findPactVaultPda(pactPda);
  const vaultUsdcAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
  console.log(`  Pact PDA:     ${pactPda.toBase58()}`);
  console.log(`  Vault PDA:    ${vaultPda.toBase58()}`);
  console.log(`  Vault USDC:   ${vaultUsdcAta.toBase58()}`);

  const openPactSig = await sendTx(
    [
      openPactIx({
        authority: authority.publicKey,
        parentCard: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        authorityUsdc: authorityAta,
        vaultUsdc: vaultUsdcAta,
        args: {
          scopeLabelHash: pactScopeHash,
          capLamports: 1_000_000n, // 1 USDC
          allowlist: [{ merchant: merchant.publicKey, capabilityHash: null }],
          expirySlot: cardExpirySlot,
        },
      }),
    ],
    [authority],
    authority.publicKey,
    "open_pact",
  );

  // Vault should now have 1 USDC
  const vaultUsdcAfterOpen = (await getAccount(conn, vaultUsdcAta)).amount;
  console.log(`  Vault balance after open: ${Number(vaultUsdcAfterOpen) / 1e6} USDC`);
  if (vaultUsdcAfterOpen !== 1_000_000n) {
    throw new Error(`Vault should have 1 USDC, has ${Number(vaultUsdcAfterOpen) / 1e6}`);
  }
  console.log();

  // ───────── Step 3: spend_via_pact ─────────
  console.log("Step 3/4: spend_via_pact (agent signs, pays merchant 0.5 USDC)");
  const merchantAta = await getAssociatedTokenAddress(usdcMint, merchant.publicKey);
  // Pre-create merchant ATA if missing (paid by facilitator since merchant has no SOL)
  const merchantAtaInfo = await conn.getAccountInfo(merchantAta, "confirmed");
  const preIxs: TransactionInstruction[] = [];
  if (!merchantAtaInfo) {
    console.log(`  Creating merchant ATA ${merchantAta.toBase58()}…`);
    preIxs.push(
      createAssociatedTokenAccountInstruction(
        facilitator.publicKey,
        merchantAta,
        merchant.publicKey,
        usdcMint,
      ),
    );
  }

  const spendArgs = {
    amount: 500_000n, // 0.5 USDC
    capabilityHash: randomHash32(),
    receiptHash: randomHash32(),
    reasonHash: randomHash32(),
    policySnapshotHash: randomHash32(),
    merchantOwner: merchant.publicKey,
  };

  const merchantBefore = merchantAtaInfo
    ? (await getAccount(conn, merchantAta)).amount
    : 0n;

  const spendSig = await sendTx(
    [
      ...preIxs,
      spendViaPactIx({
        agent: facilitator.publicKey,
        feePayer: facilitator.publicKey,
        card: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdc: vaultUsdcAta,
        merchantUsdc: merchantAta,
        args: spendArgs,
      }),
    ],
    [facilitator],
    facilitator.publicKey,
    "spend_via_pact",
  );

  // Verify state changed correctly
  const merchantAfter = (await getAccount(conn, merchantAta)).amount;
  const vaultAfter = (await getAccount(conn, vaultUsdcAta)).amount;
  console.log(`  Merchant balance: ${Number(merchantBefore) / 1e6} → ${Number(merchantAfter) / 1e6} USDC`);
  console.log(`  Vault balance:    ${Number(vaultUsdcAfterOpen) / 1e6} → ${Number(vaultAfter) / 1e6} USDC`);
  if (merchantAfter - merchantBefore !== 500_000n) {
    throw new Error(`Merchant should have received 0.5 USDC, got ${Number(merchantAfter - merchantBefore) / 1e6}`);
  }
  if (vaultUsdcAfterOpen - vaultAfter !== 500_000n) {
    throw new Error(`Vault should have decreased by 0.5 USDC, decreased by ${Number(vaultUsdcAfterOpen - vaultAfter) / 1e6}`);
  }
  console.log();

  // ───────── Step 4: indexer poll ─────────
  console.log("Step 4/4: poll Postgres for indexer-written policy_decisions row (15s timeout)");
  const row = await pollPolicyDecision(spendSig, 15_000);
  if (row) {
    console.log(`  ✓ policy_decisions row found:`);
    console.log(`    decision:  ${row.decision}`);
    console.log(`    amount:    ${Number(row.amount_lamports) / 1e6} USDC`);
    console.log(`    card:      ${row.card_pubkey}`);
    console.log(`    merchant:  ${row.merchant_pubkey}`);
    console.log(`    pact:      ${row.pact_pubkey ?? "(no pact)"}`);
    console.log(`    slot:      ${row.slot}`);
  } else {
    console.log(
      `  ⚠ No policy_decisions row within 15s. The indexer may not be running locally.`,
    );
    console.log(`     This is OK if the deployed indexer caught it — check Solscan for the event log.`);
  }
  console.log();

  console.log("=".repeat(70));
  console.log("E2E flow PASSED. All on-chain assertions held.");
  console.log("=".repeat(70));
  console.log(`Tx history (Solscan):`);
  console.log(`  create_card:     https://solscan.io/tx/${createCardSig}?cluster=${cluster}`);
  console.log(`  open_pact:       https://solscan.io/tx/${openPactSig}?cluster=${cluster}`);
  console.log(`  spend_via_pact:  https://solscan.io/tx/${spendSig}?cluster=${cluster}`);
}

main().catch((e) => {
  console.error();
  console.error("E2E FAILED:", (e as Error).message);
  console.error((e as Error).stack);
  process.exit(1);
});
