/**
 * Layered commitment model (see packages/sdk/src/canonical.ts for full rationale + schemas):
 *
 *   plaintext purpose          → encrypted_metadata (libsodium sealed-box; off-chain)
 *           │
 *           ▼ NFC + trim, BLAKE3
 *   purpose_text_hash (32 B)   → field of CanonicalReceipt → folded into receipt_hash
 *           │
 *           ▼ canonical JSON, BLAKE3
 *   receipt_hash               → ON-CHAIN
 *
 *   reason → reason_hash, policy_snapshot → policy_snapshot_hash → ON-CHAIN
 *
 *   { request context, method, path, amount, 3×on-chain hashes }
 *           │
 *           ▼ canonical JSON, BLAKE3
 *   purpose_hash (BINDING)     → off-chain DB column
 *
 * Canonical schemas (`CanonicalReceipt`, `CanonicalReason`, `CanonicalPolicySnapshot`) live in
 * `@settle/sdk/canonical` because they carry zod runtime validation. This module keeps only
 * structural types that have no runtime cost.
 */

export interface ReceiptHashes {
  receipt_hash: Uint8Array;        // 32 bytes — ON-CHAIN
  reason_hash: Uint8Array;         // 32 bytes — ON-CHAIN
  policy_snapshot_hash: Uint8Array;// 32 bytes — ON-CHAIN
  /** Binding meta-commitment (off-chain, DB column `purpose_hash`). */
  purpose_hash: Uint8Array;        // 32 bytes
}
