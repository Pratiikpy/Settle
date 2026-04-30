import { z } from "zod";
import {
  bytesToHex,
  canonicalPolicySnapshotHash,
  canonicalPurposeHash,
  canonicalReasonHash,
  canonicalReceiptHash,
  CanonicalPolicySnapshotSchema,
  CanonicalReasonSchema,
  CanonicalReceiptSchema,
  purposeTextHash,
  type CanonicalPolicySnapshot,
  type CanonicalReason,
  type CanonicalReceipt,
} from "./canonical.js";

/**
 * High-level helper that computes the full hash chain for a receipt in one call.
 * Used by both the API (when issuing decisions) and clients (when verifying).
 *
 * Inputs are validated via zod; outputs are hex strings (no Uint8Array leakage to callers).
 */

const HttpMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const HttpPath = z.string().min(1).max(2048).regex(/^\/[^\s]*$/);

export const BuildReceiptInputSchema = z.object({
  receipt: CanonicalReceiptSchema,
  reason: CanonicalReasonSchema,
  policy_snapshot: CanonicalPolicySnapshotSchema,
  http: z.object({ method: HttpMethod, path: HttpPath }),
  /** Plaintext purpose. Hashed → folded into receipt.purpose_text_hash if not pre-set. */
  plaintext_purpose: z.string().min(1).max(2048).optional(),
});
export type BuildReceiptInput = z.infer<typeof BuildReceiptInputSchema>;

export interface BuiltReceipt {
  receipt: CanonicalReceipt;
  reason: CanonicalReason;
  policy_snapshot: CanonicalPolicySnapshot;
  hashes: {
    purpose_text_hash: string;
    receipt_hash: string;
    reason_hash: string;
    policy_snapshot_hash: string;
    purpose_hash: string;
  };
}

/**
 * Build the full canonical hash chain. Returns hex hashes ready for on-chain commit
 * + DB row insertion + the binding off-chain `purpose_hash`.
 */
export function buildReceiptHashes(raw: unknown): BuiltReceipt {
  const input = BuildReceiptInputSchema.parse(raw);

  const purpose_text_hash =
    input.plaintext_purpose !== undefined
      ? bytesToHex(purposeTextHash(input.plaintext_purpose))
      : input.receipt.purpose_text_hash;

  const receipt: CanonicalReceipt = {
    ...input.receipt,
    purpose_text_hash,
  };

  const receipt_hash = bytesToHex(canonicalReceiptHash(receipt));
  const reason_hash = bytesToHex(canonicalReasonHash(input.reason));
  const policy_snapshot_hash = bytesToHex(canonicalPolicySnapshotHash(input.policy_snapshot));

  const purpose_hash = bytesToHex(
    canonicalPurposeHash({
      request_id: receipt.request_id,
      agent_card_pubkey: receipt.card_pubkey,
      pact_pubkey: receipt.pact_pubkey,
      merchant_pubkey: receipt.merchant_pubkey,
      capability_hash: receipt.capability_hash,
      method: input.http.method,
      path: input.http.path,
      amount_lamports: receipt.amount_lamports,
      receipt_hash,
      reason_hash,
      policy_snapshot_hash,
    }),
  );

  return {
    receipt,
    reason: input.reason,
    policy_snapshot: input.policy_snapshot,
    hashes: {
      purpose_text_hash,
      receipt_hash,
      reason_hash,
      policy_snapshot_hash,
      purpose_hash,
    },
  };
}
