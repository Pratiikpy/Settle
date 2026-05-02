import {
  bytesToHex,
  canonicalPolicySnapshotHash,
  canonicalPurposeHash,
  canonicalReasonHash,
  canonicalReceiptHash,
  purposeTextHash,
  type CanonicalPolicySnapshot,
  type CanonicalReason,
  type CanonicalReceipt,
  type PurposeHashInput,
} from "./canonical.js";

export interface VerifyReceiptInput {
  /** Canonical receipt object reconstructed from DB row. */
  receipt: CanonicalReceipt;
  /** Canonical reason object reconstructed from DB row. */
  reason: CanonicalReason;
  /** Canonical policy snapshot reconstructed from DB row. */
  policy_snapshot: CanonicalPolicySnapshot;
  /** HTTP context the agent used to purchase. */
  http: { method: PurposeHashInput["method"]; path: string };
  /** Expected hex-encoded hashes (3 from on-chain via Solscan, plus binding from DB). */
  expected: {
    receipt_hash: string;
    reason_hash: string;
    policy_snapshot_hash: string;
    purpose_hash: string;
  };
  /**
   * Optional: if you decrypted the off-chain `encrypted_metadata`, pass the plaintext
   * purpose string here and we will additionally verify it matches receipt.purpose_text_hash.
   */
  plaintext_purpose?: string;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; mismatches: string[] };

/**
 * Recompute every layer of the commitment chain and compare to expected.
 * - receipt_hash  : recomputed locally vs. on-chain via Solscan
 * - reason_hash   : recomputed locally vs. on-chain via Solscan
 * - policy_snapshot_hash : recomputed locally vs. on-chain via Solscan
 * - purpose_hash  : recomputed locally vs. DB (binds the 3 on-chain hashes + HTTP context)
 * - purpose_text_hash : optional, only when plaintext_purpose is provided
 *
 * Returns `{ ok: true }` only when every layer matches.
 */
export function verifyReceipt(input: VerifyReceiptInput): VerifyResult {
  const mismatches: string[] = [];

  if (input.plaintext_purpose !== undefined) {
    const got = bytesToHex(purposeTextHash(input.plaintext_purpose));
    if (got !== input.receipt.purpose_text_hash) {
      mismatches.push("purpose_text_hash");
    }
  }

  const receiptHashHex = bytesToHex(canonicalReceiptHash(input.receipt));
  if (receiptHashHex !== input.expected.receipt_hash) mismatches.push("receipt_hash");

  const reasonHashHex = bytesToHex(canonicalReasonHash(input.reason));
  if (reasonHashHex !== input.expected.reason_hash) mismatches.push("reason_hash");

  const psHashHex = bytesToHex(canonicalPolicySnapshotHash(input.policy_snapshot));
  if (psHashHex !== input.expected.policy_snapshot_hash) {
    mismatches.push("policy_snapshot_hash");
  }

  const bindingInput: PurposeHashInput = {
    request_id: input.receipt.request_id,
    agent_card_pubkey: input.receipt.card_pubkey,
    pact_pubkey: input.receipt.pact_pubkey,
    merchant_pubkey: input.receipt.merchant_pubkey,
    capability_hash: input.receipt.capability_hash,
    method: input.http.method,
    path: input.http.path,
    amount_lamports: input.receipt.amount_lamports,
    receipt_hash: input.expected.receipt_hash,
    reason_hash: input.expected.reason_hash,
    policy_snapshot_hash: input.expected.policy_snapshot_hash,
  };
  const purposeHashHex = bytesToHex(canonicalPurposeHash(bindingInput));
  if (purposeHashHex !== input.expected.purpose_hash) mismatches.push("purpose_hash");

  return mismatches.length === 0 ? { ok: true } : { ok: false, mismatches };
}

// ─────────────────────────────────────────────────────────────────────────────
// Kernel-aware verifier (F2.0).
//
// For non-x402 kinds — direct_send, link_send, streaming_claim, escrow_*,
// refund — the kernel uses a synthetic HTTP context (`POST /_kernel/<kind>`).
// This wrapper infers the right http defaults so callers don't have to know
// the convention; they pass kind + canonical objects + expected hashes.
//
// Pass an explicit `http` field when the receipt was committed with real
// HTTP context (x402_spend), or omit it for synthetic.
// ─────────────────────────────────────────────────────────────────────────────

export type ReceiptKindForVerify =
  | "x402_spend"
  | "direct_send"
  | "link_send"
  | "streaming_claim"
  | "escrow_release"
  | "escrow_dispute"
  | "refund";

export function verifyKernelReceipt(input: {
  kind: ReceiptKindForVerify;
  receipt: CanonicalReceipt;
  reason: CanonicalReason;
  policy_snapshot: CanonicalPolicySnapshot;
  expected: VerifyReceiptInput["expected"];
  /** Override only when the receipt was committed with real HTTP context (x402). */
  http?: VerifyReceiptInput["http"];
  plaintext_purpose?: string;
}): VerifyResult {
  const http = input.http ?? {
    method: "POST" as const,
    path: `/_kernel/${input.kind}`,
  };
  // Spread plaintext_purpose only when defined — exactOptionalPropertyTypes
  // refuses an explicit `undefined` for an optional field.
  const verifyArgs: VerifyReceiptInput = {
    receipt: input.receipt,
    reason: input.reason,
    policy_snapshot: input.policy_snapshot,
    http,
    expected: input.expected,
    ...(input.plaintext_purpose !== undefined
      ? { plaintext_purpose: input.plaintext_purpose }
      : {}),
  };
  return verifyReceipt(verifyArgs);
}
