// Settle x Ika sidetrack — Anchor 1.0 ix data builders for the
// `settle-dwallet-router` program.
//
// We hand-build ix data via `@settle/sdk`'s Borsh writer so the sign flow
// doesn't depend on the auto-generated IDL (which is deferred while the
// flat workspace layout is in place — see SIDETRACK-IKA-PLAN.md §B.5).
//
// Anchor ix data layout: `[8-byte sighash discriminator][borsh-encoded args]`.
// Discriminator = `sha256("global:" + ix_name)[0..8]`.

import { Buffer } from "node:buffer";
import { buildIxData } from "@settle/sdk";

// ── Param shapes (mirror programs-ika/.../src/lib.rs) ──

export interface CrosschainAllowlistEntryArgs {
  chainNamespace: Uint8Array; // [u8; 16]
  chainReference: Uint8Array; // [u8; 32]
  recipientKind: number; // u8
  recipient: Uint8Array; // [u8; 32]
  assetKind: number; // u8
  asset: Uint8Array; // [u8; 32]
  capabilityHash: Uint8Array; // [u8; 32]
}

export interface InitCrosschainCardArgs {
  labelHash: Uint8Array; // [u8; 32]
  agentPubkey: Uint8Array; // [u8; 32]
  dwalletPubkey: Uint8Array; // [u8; 32]
  gasDepositPubkey: Uint8Array; // [u8; 32]
  dailyCapMinor: bigint;
  perCallMaxMinor: bigint;
  expirySlot: bigint;
  allowlist: CrosschainAllowlistEntryArgs[];
}

export interface RequestCrosschainSignArgs {
  requestId: Uint8Array; // [u8; 16]
  messageDigest: Uint8Array; // [u8; 32]
  messageMetadataDigest: Uint8Array; // [u8; 32]
  userPubkey: Uint8Array; // [u8; 32]
  signatureScheme: number; // u16
  messageApprovalBump: number; // u8
  amountMinor: bigint;
  chainNamespace: Uint8Array; // [u8; 16]
  chainReference: Uint8Array; // [u8; 32]
  recipientKind: number; // u8
  recipient: Uint8Array; // [u8; 32]
  assetKind: number; // u8
  asset: Uint8Array; // [u8; 32]
  capabilityHash: Uint8Array; // [u8; 32]
  receiptHash: Uint8Array; // [u8; 32]
  reasonHash: Uint8Array; // [u8; 32]
  policySnapshotHash: Uint8Array; // [u8; 32]
  purposeHash: Uint8Array; // [u8; 32]
}

// ── Builders ──

function writeAllowlistEntry(w: import("@settle/sdk").BorshWriter, e: CrosschainAllowlistEntryArgs): void {
  w.fixedBytes(e.chainNamespace, 16);
  w.fixedBytes(e.chainReference, 32);
  w.u8(e.recipientKind);
  w.fixedBytes(e.recipient, 32);
  w.u8(e.assetKind);
  w.fixedBytes(e.asset, 32);
  w.fixedBytes(e.capabilityHash, 32);
}

/** Build ix data for `init_crosschain_card`. */
export function buildInitCrosschainCardIxData(args: InitCrosschainCardArgs): Buffer {
  return buildIxData("init_crosschain_card", (w) => {
    w.fixedBytes(args.labelHash, 32);
    w.fixedBytes(args.agentPubkey, 32);
    w.fixedBytes(args.dwalletPubkey, 32);
    w.fixedBytes(args.gasDepositPubkey, 32);
    w.u128(args.dailyCapMinor);
    w.u128(args.perCallMaxMinor);
    w.u64(args.expirySlot);
    w.vec(args.allowlist, writeAllowlistEntry);
  });
}

/** Build ix data for `request_crosschain_sign`. */
export function buildRequestCrosschainSignIxData(args: RequestCrosschainSignArgs): Buffer {
  return buildIxData("request_crosschain_sign", (w) => {
    w.fixedBytes(args.requestId, 16);
    w.fixedBytes(args.messageDigest, 32);
    w.fixedBytes(args.messageMetadataDigest, 32);
    w.fixedBytes(args.userPubkey, 32);
    // Note: program defines this as u16 — write 2 bytes LE explicitly because
    // BorshWriter doesn't expose u16 (we synthesize it from two u8 writes
    // little-endian).
    w.u8(args.signatureScheme & 0xff);
    w.u8((args.signatureScheme >> 8) & 0xff);
    w.u8(args.messageApprovalBump);
    w.u128(args.amountMinor);
    w.fixedBytes(args.chainNamespace, 16);
    w.fixedBytes(args.chainReference, 32);
    w.u8(args.recipientKind);
    w.fixedBytes(args.recipient, 32);
    w.u8(args.assetKind);
    w.fixedBytes(args.asset, 32);
    w.fixedBytes(args.capabilityHash, 32);
    w.fixedBytes(args.receiptHash, 32);
    w.fixedBytes(args.reasonHash, 32);
    w.fixedBytes(args.policySnapshotHash, 32);
    w.fixedBytes(args.purposeHash, 32);
  });
}

/** Build ix data for `record_signed_outcome`. */
export function buildRecordSignedOutcomeIxData(targetTxHash: Uint8Array): Buffer {
  if (targetTxHash.length !== 32)
    throw new Error("targetTxHash must be 32 bytes");
  return buildIxData("record_signed_outcome", (w) => {
    w.fixedBytes(targetTxHash, 32);
  });
}

/** Build ix data for `revoke_crosschain_card`. No args. */
export function buildRevokeCrosschainCardIxData(): Buffer {
  return buildIxData("revoke_crosschain_card", () => {});
}
