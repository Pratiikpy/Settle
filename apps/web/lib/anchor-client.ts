/**
 * Hand-written Anchor client for the `settle-agent-card` program.
 *
 * This file mirrors the program's Rust code byte-for-byte:
 *   programs/settle-agent-card/programs/settle-agent-card/src/lib.rs    (ix names + handlers)
 *   programs/settle-agent-card/programs/settle-agent-card/src/state.rs  (account structs)
 *
 * Once `pnpm deploy:devnet` runs `anchor build`, Codama will produce a generated client
 * that supersedes this file. Until then, this is the truth.
 */

import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { blake3 } from "@noble/hashes/blake3";
import { buildIxData, BorshWriter } from "./borsh";

// ─────────────────────────────────────────────────────────────────────────────
// Program ID — fail LOUDLY at first use (not at module load) if it's the
// placeholder or unset. Static pages that import this module for type re-exports
// must not crash on dev startup, but any actual ix build must fail clearly.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_PROGRAM_ID = "SettLe1111111111111111111111111111111111111";

function getProgramIdRaw(): string | undefined {
  return process.env.NEXT_PUBLIC_SETTLE_PROGRAM_ID ?? process.env.SETTLE_AGENT_CARD_PROGRAM_ID;
}

function assertRealProgramId(): PublicKey {
  const raw = getProgramIdRaw();
  if (!raw) {
    throw new Error(
      "SETTLE_AGENT_CARD_PROGRAM_ID (or NEXT_PUBLIC_SETTLE_PROGRAM_ID) is not set. " +
        "Run `pnpm deploy:devnet` to generate a real program keypair, then export it.",
    );
  }
  if (raw === PLACEHOLDER_PROGRAM_ID) {
    throw new Error(
      `SETTLE_AGENT_CARD_PROGRAM_ID is still the placeholder ${PLACEHOLDER_PROGRAM_ID}. ` +
        "Run `pnpm deploy:devnet` to deploy and patch with the real ID.",
    );
  }
  return new PublicKey(raw);
}

/**
 * Settle program ID. Falls back to the placeholder for static-typing-only paths
 * (PDA derivation in marketing pages, etc.); ix builders re-validate via
 * `assertRealProgramId()` and throw clearly when unset.
 */
export const SETTLE_PROGRAM_ID: PublicKey = (() => {
  const raw = getProgramIdRaw();
  return new PublicKey(raw ?? PLACEHOLDER_PROGRAM_ID);
})();

/** True if the program ID is the deployable real one (not the placeholder). */
export function isProgramIdConfigured(): boolean {
  const raw = getProgramIdRaw();
  return Boolean(raw && raw !== PLACEHOLDER_PROGRAM_ID);
}

// ─────────────────────────────────────────────────────────────────────────────
// PDA seed helpers (must match programs/settle-agent-card/src/state.rs)
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_CARD_SEED = Buffer.from("agent-card");
const PACT_SEED = Buffer.from("pact");
const PACT_VAULT_SEED = Buffer.from("pact-vault");

export function labelHashBytes(label: string): Buffer {
  return Buffer.from(blake3(new TextEncoder().encode(label)));
}

export function findAgentCardPda(authority: PublicKey, labelHash: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [AGENT_CARD_SEED, authority.toBuffer(), labelHash],
    SETTLE_PROGRAM_ID,
  );
}

export function findPactPda(parentCard: PublicKey, scopeLabelHash: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PACT_SEED, parentCard.toBuffer(), scopeLabelHash],
    SETTLE_PROGRAM_ID,
  );
}

/** Vault PDA — owns the Pact's USDC ATA. Program signs CPIs as this PDA. */
export function findPactVaultPda(pact: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PACT_VAULT_SEED, pact.toBuffer()], SETTLE_PROGRAM_ID);
}

// ─────────────────────────────────────────────────────────────────────────────
// AllowlistEntry — matches struct AllowlistEntry { merchant_pubkey, capability_hash: Option<[u8;32]> }
// ─────────────────────────────────────────────────────────────────────────────

export interface AllowlistEntry {
  merchant: PublicKey;
  capabilityHash: Uint8Array | null;
}

function writeAllowlistEntry(w: BorshWriter, entry: AllowlistEntry) {
  w.fixedBytes(entry.merchant.toBuffer(), 32);
  w.option(entry.capabilityHash, (ww, h) => ww.fixedBytes(h, 32));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. create_card(params: CreateCardParams)  + usdc_mint account
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCardParams {
  agentPubkey: PublicKey;
  labelHash: Uint8Array;
  dailyCapLamports: bigint;
  perCallMaxLamports: bigint;
  allowlist: AllowlistEntry[];
  expirySlot: bigint;
  policyVersion: number;
}

export function createCardIx(params: {
  authority: PublicKey;
  card: PublicKey;
  usdcMint: PublicKey;
  args: CreateCardParams;
}): TransactionInstruction {
  assertRealProgramId();
  const data = buildIxData("create_card", (w) => {
    w.fixedBytes(params.args.agentPubkey.toBuffer(), 32);
    w.fixedBytes(params.args.labelHash, 32);
    w.u64(params.args.dailyCapLamports);
    w.u64(params.args.perCallMaxLamports);
    w.vec(params.args.allowlist, writeAllowlistEntry);
    w.u64(params.args.expirySlot);
    w.u32(params.args.policyVersion);
  });

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.card, isSigner: false, isWritable: true },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. spend(amount, capability_hash, receipt_hash, reason_hash, policy_snapshot_hash)
//    — authority-signed, TransferChecked + mint pin
// ─────────────────────────────────────────────────────────────────────────────

export interface SpendArgs {
  amount: bigint;
  merchantOwner: PublicKey;
  capabilityHash: Uint8Array;
  receiptHash: Uint8Array;
  reasonHash: Uint8Array;
  policySnapshotHash: Uint8Array;
}

export function spendIx(params: {
  authority: PublicKey;
  card: PublicKey;
  usdcMint: PublicKey;
  authorityUsdc: PublicKey;
  merchantUsdc: PublicKey;
  args: SpendArgs;
}): TransactionInstruction {
  assertRealProgramId();
  const data = buildIxData("spend", (w) => {
    w.u64(params.args.amount);
    w.fixedBytes(params.args.capabilityHash, 32);
    w.fixedBytes(params.args.receiptHash, 32);
    w.fixedBytes(params.args.reasonHash, 32);
    w.fixedBytes(params.args.policySnapshotHash, 32);
  });

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.card, isSigner: false, isWritable: true },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: params.authorityUsdc, isSigner: false, isWritable: true },
      { pubkey: params.merchantUsdc, isSigner: false, isWritable: true },
      { pubkey: params.args.merchantOwner, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Convenience: derives buyer + merchant ATAs from mint, then builds spend ix. */
export function spendIxWithAtas(params: {
  authority: PublicKey;
  card: PublicKey;
  usdcMint: PublicKey;
  args: SpendArgs;
}): TransactionInstruction {
  const authorityUsdc = getAssociatedTokenAddressSync(params.usdcMint, params.authority);
  const merchantUsdc = getAssociatedTokenAddressSync(params.usdcMint, params.args.merchantOwner);
  return spendIx({
    authority: params.authority,
    card: params.card,
    usdcMint: params.usdcMint,
    authorityUsdc,
    merchantUsdc,
    args: params.args,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. spend_via_pact — agent-signed, Vault PDA executes the transfer.
// ─────────────────────────────────────────────────────────────────────────────

export function spendViaPactIx(params: {
  agent: PublicKey;
  feePayer: PublicKey;
  card: PublicKey;
  pact: PublicKey;
  vault: PublicKey;
  usdcMint: PublicKey;
  vaultUsdc: PublicKey;
  merchantUsdc: PublicKey;
  args: SpendArgs;
}): TransactionInstruction {
  assertRealProgramId();
  const data = buildIxData("spend_via_pact", (w) => {
    w.u64(params.args.amount);
    w.fixedBytes(params.args.capabilityHash, 32);
    w.fixedBytes(params.args.receiptHash, 32);
    w.fixedBytes(params.args.reasonHash, 32);
    w.fixedBytes(params.args.policySnapshotHash, 32);
  });

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.agent, isSigner: true, isWritable: false },
      { pubkey: params.feePayer, isSigner: true, isWritable: true },
      { pubkey: params.card, isSigner: false, isWritable: false },
      { pubkey: params.pact, isSigner: false, isWritable: true },
      { pubkey: params.vault, isSigner: false, isWritable: false },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: params.vaultUsdc, isSigner: false, isWritable: true },
      { pubkey: params.merchantUsdc, isSigner: false, isWritable: true },
      { pubkey: params.args.merchantOwner, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Convenience: derives vault PDA + vault ATA + merchant ATA from inputs. */
export function spendViaPactIxWithAtas(params: {
  agent: PublicKey;
  feePayer: PublicKey;
  card: PublicKey;
  pact: PublicKey;
  usdcMint: PublicKey;
  args: SpendArgs;
}): TransactionInstruction {
  const [vault] = findPactVaultPda(params.pact);
  const vaultUsdc = getAssociatedTokenAddressSync(params.usdcMint, vault, true);
  const merchantUsdc = getAssociatedTokenAddressSync(params.usdcMint, params.args.merchantOwner);
  return spendViaPactIx({
    ...params,
    vault,
    vaultUsdc,
    merchantUsdc,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. revoke()
// ─────────────────────────────────────────────────────────────────────────────

export function revokeIx(params: { authority: PublicKey; card: PublicKey }): TransactionInstruction {
  assertRealProgramId();
  const data = buildIxData("revoke", () => {});
  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.card, isSigner: false, isWritable: true },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. record_denial(deny_code, merchant, pact, receipt_hash, reason_hash, policy_snapshot_hash)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * record_denial: signer is either card.authority or card.agent_pubkey. Both are
 * acceptable per the program; the on-chain constraint enforces this.
 */
export function recordDenialIx(params: {
  signer: PublicKey;
  card: PublicKey;
  args: {
    denyCode: number;
    merchant: PublicKey;
    pact: PublicKey;
    receiptHash: Uint8Array;
    reasonHash: Uint8Array;
    policySnapshotHash: Uint8Array;
  };
}): TransactionInstruction {
  assertRealProgramId();
  const data = buildIxData("record_denial", (w) => {
    w.u8(params.args.denyCode);
    w.fixedBytes(params.args.merchant.toBuffer(), 32);
    w.fixedBytes(params.args.pact.toBuffer(), 32);
    w.fixedBytes(params.args.receiptHash, 32);
    w.fixedBytes(params.args.reasonHash, 32);
    w.fixedBytes(params.args.policySnapshotHash, 32);
  });

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.signer, isSigner: true, isWritable: false },
      { pubkey: params.card, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. open_pact — creates Pact PDA + initializes Vault USDC ATA + funds it.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenPactParams {
  scopeLabelHash: Uint8Array;
  capLamports: bigint;
  allowlist: AllowlistEntry[];
  expirySlot: bigint;
}

export function openPactIx(params: {
  authority: PublicKey;
  parentCard: PublicKey;
  pact: PublicKey;
  usdcMint: PublicKey;
  authorityUsdc?: PublicKey; // optional override; default = ATA derivation
  args: OpenPactParams;
}): TransactionInstruction {
  assertRealProgramId();
  const [vault] = findPactVaultPda(params.pact);
  const authorityUsdc =
    params.authorityUsdc ?? getAssociatedTokenAddressSync(params.usdcMint, params.authority);
  const vaultUsdc = getAssociatedTokenAddressSync(params.usdcMint, vault, true);

  const data = buildIxData("open_pact", (w) => {
    w.fixedBytes(params.args.scopeLabelHash, 32);
    w.u64(params.args.capLamports);
    w.vec(params.args.allowlist, writeAllowlistEntry);
    w.u64(params.args.expirySlot);
  });

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.parentCard, isSigner: false, isWritable: false },
      { pubkey: params.pact, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: authorityUsdc, isSigner: false, isWritable: true },
      { pubkey: vaultUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. close_pact — drains vault ATA back to authority, marks pact closed.
// ─────────────────────────────────────────────────────────────────────────────

export function closePactIx(params: {
  authority: PublicKey;
  pact: PublicKey;
  usdcMint: PublicKey;
  authorityUsdc?: PublicKey;
}): TransactionInstruction {
  assertRealProgramId();
  const [vault] = findPactVaultPda(params.pact);
  const authorityUsdc =
    params.authorityUsdc ?? getAssociatedTokenAddressSync(params.usdcMint, params.authority);
  const vaultUsdc = getAssociatedTokenAddressSync(params.usdcMint, vault, true);

  const data = buildIxData("close_pact", () => {});
  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.pact, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: vaultUsdc, isSigner: false, isWritable: true },
      { pubkey: authorityUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. open_streaming_pact — Streaming Pact opened with rate + max_total funded.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenStreamingPactParams {
  scopeLabelHash: Uint8Array;
  rateLamportsPerSlot: bigint;
  maxTotalLamports: bigint;
  allowlist: AllowlistEntry[];
  expirySlot: bigint;
}

export function openStreamingPactIx(params: {
  authority: PublicKey;
  parentCard: PublicKey;
  pact: PublicKey;
  usdcMint: PublicKey;
  authorityUsdc?: PublicKey;
  args: OpenStreamingPactParams;
}): TransactionInstruction {
  assertRealProgramId();
  const [vault] = findPactVaultPda(params.pact);
  const authorityUsdc =
    params.authorityUsdc ?? getAssociatedTokenAddressSync(params.usdcMint, params.authority);
  const vaultUsdc = getAssociatedTokenAddressSync(params.usdcMint, vault, true);

  const data = buildIxData("open_streaming_pact", (w) => {
    w.fixedBytes(params.args.scopeLabelHash, 32);
    w.u64(params.args.rateLamportsPerSlot);
    w.u64(params.args.maxTotalLamports);
    w.vec(params.args.allowlist, writeAllowlistEntry);
    w.u64(params.args.expirySlot);
  });

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.parentCard, isSigner: false, isWritable: false },
      { pubkey: params.pact, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: authorityUsdc, isSigner: false, isWritable: true },
      { pubkey: vaultUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. claim_streaming — agent draws accrued entitlement.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaimStreamingArgs {
  merchantOwner: PublicKey;
  capabilityHash: Uint8Array;
  receiptHash: Uint8Array;
  reasonHash: Uint8Array;
  policySnapshotHash: Uint8Array;
}

export function claimStreamingIx(params: {
  agent: PublicKey;
  feePayer: PublicKey;
  card: PublicKey;
  pact: PublicKey;
  vault: PublicKey;
  usdcMint: PublicKey;
  vaultUsdc: PublicKey;
  merchantUsdc: PublicKey;
  args: ClaimStreamingArgs;
}): TransactionInstruction {
  assertRealProgramId();
  const data = buildIxData("claim_streaming", (w) => {
    w.fixedBytes(params.args.capabilityHash, 32);
    w.fixedBytes(params.args.receiptHash, 32);
    w.fixedBytes(params.args.reasonHash, 32);
    w.fixedBytes(params.args.policySnapshotHash, 32);
  });

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.agent, isSigner: true, isWritable: false },
      { pubkey: params.feePayer, isSigner: true, isWritable: true },
      { pubkey: params.card, isSigner: false, isWritable: true },
      { pubkey: params.pact, isSigner: false, isWritable: true },
      { pubkey: params.vault, isSigner: false, isWritable: false },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: params.vaultUsdc, isSigner: false, isWritable: true },
      { pubkey: params.merchantUsdc, isSigner: false, isWritable: true },
      { pubkey: params.args.merchantOwner, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Convenience: derives vault PDA + vault ATA + merchant ATA from inputs. */
export function claimStreamingIxWithAtas(params: {
  agent: PublicKey;
  feePayer: PublicKey;
  card: PublicKey;
  pact: PublicKey;
  usdcMint: PublicKey;
  args: ClaimStreamingArgs;
}): TransactionInstruction {
  const [vault] = findPactVaultPda(params.pact);
  const vaultUsdc = getAssociatedTokenAddressSync(params.usdcMint, vault, true);
  const merchantUsdc = getAssociatedTokenAddressSync(params.usdcMint, params.args.merchantOwner);
  return claimStreamingIx({
    ...params,
    vault,
    vaultUsdc,
    merchantUsdc,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. pause_streaming / resume_streaming — authority-only state toggles.
// ─────────────────────────────────────────────────────────────────────────────

export function pauseStreamingIx(params: {
  authority: PublicKey;
  pact: PublicKey;
}): TransactionInstruction {
  assertRealProgramId();
  const data = buildIxData("pause_streaming", () => {});
  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.pact, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function resumeStreamingIx(params: {
  authority: PublicKey;
  pact: PublicKey;
}): TransactionInstruction {
  assertRealProgramId();
  const data = buildIxData("resume_streaming", () => {});
  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.pact, isSigner: false, isWritable: true },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. open_delivery_escrow — buyer signs, vault funded, merchant + capability pinned.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenDeliveryEscrowParams {
  scopeLabelHash: Uint8Array;
  amount: bigint;
  merchant: PublicKey;
  capabilityHash: Uint8Array;
  confirmDeadlineSlot: bigint;
  disputeDeadlineSlot: bigint;
  expirySlot: bigint;
}

export function openDeliveryEscrowIx(params: {
  authority: PublicKey;
  parentCard: PublicKey;
  pact: PublicKey;
  usdcMint: PublicKey;
  authorityUsdc?: PublicKey;
  args: OpenDeliveryEscrowParams;
}): TransactionInstruction {
  assertRealProgramId();
  const [vault] = findPactVaultPda(params.pact);
  const authorityUsdc =
    params.authorityUsdc ?? getAssociatedTokenAddressSync(params.usdcMint, params.authority);
  const vaultUsdc = getAssociatedTokenAddressSync(params.usdcMint, vault, true);

  const data = buildIxData("open_delivery_escrow", (w) => {
    w.fixedBytes(params.args.scopeLabelHash, 32);
    w.u64(params.args.amount);
    w.fixedBytes(params.args.merchant.toBuffer(), 32);
    w.fixedBytes(params.args.capabilityHash, 32);
    w.u64(params.args.confirmDeadlineSlot);
    w.u64(params.args.disputeDeadlineSlot);
    w.u64(params.args.expirySlot);
  });

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.parentCard, isSigner: false, isWritable: false },
      { pubkey: params.pact, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: authorityUsdc, isSigner: false, isWritable: true },
      { pubkey: vaultUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. release_delivery_escrow — buyer-confirm OR permissionless after deadline.
// ─────────────────────────────────────────────────────────────────────────────

export function releaseDeliveryEscrowIx(params: {
  caller: PublicKey;
  pact: PublicKey;
  merchant: PublicKey;
  usdcMint: PublicKey;
  /** Optional override; default = ATA(merchant). */
  merchantUsdc?: PublicKey;
}): TransactionInstruction {
  assertRealProgramId();
  const [vault] = findPactVaultPda(params.pact);
  const vaultUsdc = getAssociatedTokenAddressSync(params.usdcMint, vault, true);
  const merchantUsdc =
    params.merchantUsdc ?? getAssociatedTokenAddressSync(params.usdcMint, params.merchant);

  const data = buildIxData("release_delivery_escrow", () => {});

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.caller, isSigner: true, isWritable: true },
      { pubkey: params.pact, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: vaultUsdc, isSigner: false, isWritable: true },
      { pubkey: merchantUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. dispute_delivery_escrow — buyer-only, before dispute_deadline_slot.
// ─────────────────────────────────────────────────────────────────────────────

export function disputeDeliveryEscrowIx(params: {
  authority: PublicKey;
  pact: PublicKey;
  usdcMint: PublicKey;
  authorityUsdc?: PublicKey;
}): TransactionInstruction {
  assertRealProgramId();
  const [vault] = findPactVaultPda(params.pact);
  const vaultUsdc = getAssociatedTokenAddressSync(params.usdcMint, vault, true);
  const authorityUsdc =
    params.authorityUsdc ?? getAssociatedTokenAddressSync(params.usdcMint, params.authority);

  const data = buildIxData("dispute_delivery_escrow", () => {});

  return new TransactionInstruction({
    programId: SETTLE_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.pact, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: vaultUsdc, isSigner: false, isWritable: true },
      { pubkey: authorityUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────────────────────────────────────

export { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SYSVAR_RENT_PUBKEY };
