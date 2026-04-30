import { blake3 } from "@noble/hashes/blake3";
import { z } from "zod";

/**
 * Canonical hashing module.
 *
 * Layered commitment model:
 *
 *   plaintext purpose string          → encrypted_metadata (libsodium sealed-box; off-chain)
 *           │
 *           ▼ NFC + trim, BLAKE3
 *   purpose_text_hash (32 bytes)      → committed inside CanonicalReceipt
 *           │
 *           ▼ canonical JSON, BLAKE3
 *   receipt_hash (32 bytes)           → ON-CHAIN (spend ix arg #3)
 *
 *   reason object                     → reason_hash (32 bytes)        → ON-CHAIN
 *   policy_snapshot object            → policy_snapshot_hash (32B)    → ON-CHAIN
 *
 *   { request context, method, path, amount, 3×on-chain hashes }
 *           │
 *           ▼ canonical JSON, BLAKE3
 *   purpose_hash (32 bytes, BINDING)  → off-chain DB column `purpose_hash`
 *
 * The 3 on-chain hashes are committed via `spend(amount, merchant, receipt_hash, reason_hash, policy_snapshot_hash)`.
 * The binding `purpose_hash` lets an auditor verify "this DB row produced *exactly* that on-chain commitment
 * via *exactly* that HTTP request" without ever exposing plaintext on chain.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Canonical JSON (sorted keys, reject undefined / BigInt / non-finite numbers)
// ─────────────────────────────────────────────────────────────────────────────

export function stableStringify(value: unknown): string {
  return _stable(value);
}

function _stable(v: unknown): string {
  if (v === undefined) {
    throw new CanonicalError("undefined is not allowed in canonical JSON; use null");
  }
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) {
      throw new CanonicalError("non-finite numbers are not allowed in canonical JSON");
    }
    return JSON.stringify(v);
  }
  if (typeof v === "bigint") {
    throw new CanonicalError("BigInt is not allowed in canonical JSON; convert to decimal string");
  }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) {
    return `[${v.map(_stable).join(",")}]`;
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, val]) => `${JSON.stringify(k)}:${_stable(val)}`)
      .join(",")}}`;
  }
  throw new CanonicalError(`unsupported value type for canonical JSON: ${typeof v}`);
}

export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// hex helpers
// ─────────────────────────────────────────────────────────────────────────────

export function bytesToHex(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) {
    out += (b[i]! >>> 4).toString(16);
    out += (b[i]! & 0x0f).toString(16);
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new CanonicalError("hex: odd length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new CanonicalError("hex: invalid character");
    out[i] = byte;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field schemas
// ─────────────────────────────────────────────────────────────────────────────

const Hex32 = z.string().regex(/^[0-9a-f]{64}$/, "must be 32-byte lowercase hex (64 chars)");
const Pubkey = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "base58 pubkey");
const Uuid = z.string().uuid();
const Decimal = z.string().regex(/^\d+$/, "non-negative decimal string");
const HttpMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const HttpPath = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^\/[^\s]*$/, "must start with '/' and contain no whitespace");

// ─────────────────────────────────────────────────────────────────────────────
// 1. purpose_text_hash — BLAKE3 of NFC-normalized + trimmed purpose string
// ─────────────────────────────────────────────────────────────────────────────

export function canonicalizePurposeText(s: string): string {
  if (typeof s !== "string") throw new CanonicalError("purpose text must be a string");
  return s.normalize("NFC").trim();
}

export function purposeTextHash(s: string): Uint8Array {
  return blake3(new TextEncoder().encode(canonicalizePurposeText(s)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CanonicalReceipt → receipt_hash (on-chain arg)
// ─────────────────────────────────────────────────────────────────────────────

export const CanonicalReceiptSchema = z.object({
  request_id: Uuid,
  card_pubkey: Pubkey,
  pact_pubkey: Pubkey.nullable(),
  merchant_pubkey: Pubkey,
  amount_lamports: Decimal,
  capability_hash: Hex32,
  purpose_text_hash: Hex32,
  decision_slot: z.number().int().nonnegative(),
  policy_version: z.number().int().nonnegative(),
});
export type CanonicalReceipt = z.infer<typeof CanonicalReceiptSchema>;

export function canonicalReceiptHash(raw: unknown): Uint8Array {
  const r = CanonicalReceiptSchema.parse(raw);
  return blake3(new TextEncoder().encode(stableStringify(r)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CanonicalReason → reason_hash (on-chain arg)
// ─────────────────────────────────────────────────────────────────────────────

export const CanonicalReasonSchema = z.object({
  decision: z.enum(["ALLOW", "DENY", "REVIEW"]),
  deny_code: z.number().int().min(0).max(8),    // 0 = not a deny
  cap_remaining_after: Decimal,                  // post-decision remaining cap
  per_call_max: Decimal,
  allowlist_match: z.boolean(),
  capability_pinned: z.boolean(),
  merchant_verified: z.boolean(),
  expiry_slot: z.number().int().nonnegative(),
  current_slot: z.number().int().nonnegative(),
});
export type CanonicalReason = z.infer<typeof CanonicalReasonSchema>;

export function canonicalReasonHash(raw: unknown): Uint8Array {
  const r = CanonicalReasonSchema.parse(raw);
  return blake3(new TextEncoder().encode(stableStringify(r)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CanonicalPolicySnapshot → policy_snapshot_hash (on-chain arg)
// ─────────────────────────────────────────────────────────────────────────────

export const CanonicalPolicySnapshotSchema = z.object({
  policy_version: z.number().int().nonnegative(),
  daily_cap: Decimal,
  per_call_max: Decimal,
  allowlist_count: z.number().int().min(0).max(10),
  expiry_slot: z.number().int().nonnegative(),
  revoked: z.boolean(),
});
export type CanonicalPolicySnapshot = z.infer<typeof CanonicalPolicySnapshotSchema>;

export function canonicalPolicySnapshotHash(raw: unknown): Uint8Array {
  const p = CanonicalPolicySnapshotSchema.parse(raw);
  return blake3(new TextEncoder().encode(stableStringify(p)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PurposeHashInput → purpose_hash (BINDING; off-chain DB column)
//    Per Pratiik's lock: option (C) — bind everything, never trust user text ordering.
// ─────────────────────────────────────────────────────────────────────────────

export const PurposeHashInputSchema = z
  .object({
    request_id: Uuid,
    agent_card_pubkey: Pubkey,
    pact_pubkey: Pubkey.nullable(),
    merchant_pubkey: Pubkey,
    capability_hash: Hex32,
    method: HttpMethod,
    path: HttpPath,
    amount_lamports: Decimal,
    receipt_hash: Hex32,
    reason_hash: Hex32,
    policy_snapshot_hash: Hex32,
  })
  .strict(); // reject unknown keys → no smuggled fields can affect the hash silently
export type PurposeHashInput = z.infer<typeof PurposeHashInputSchema>;

/**
 * Binding meta-commitment. Off-chain — populates `receipts.purpose_hash`.
 * Throws CanonicalError-or-ZodError if any required field is missing/invalid.
 *
 * Reproducibility contract:
 *   - Sorted-key canonical JSON ⇒ output is byte-stable across implementations.
 *   - All fields strictly typed via zod ⇒ a missing field, a wrong-cased method,
 *     a path without leading "/", or a non-hex-32 hash all raise BEFORE hashing.
 */
export function canonicalPurposeHash(raw: unknown): Uint8Array {
  const input = PurposeHashInputSchema.parse(raw);
  return blake3(new TextEncoder().encode(stableStringify(input)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Hex-output convenience wrappers (most callers want hex, not bytes)
// ─────────────────────────────────────────────────────────────────────────────

export const purposeTextHashHex = (s: string) => bytesToHex(purposeTextHash(s));
export const canonicalReceiptHashHex = (r: unknown) => bytesToHex(canonicalReceiptHash(r));
export const canonicalReasonHashHex = (r: unknown) => bytesToHex(canonicalReasonHash(r));
export const canonicalPolicySnapshotHashHex = (p: unknown) =>
  bytesToHex(canonicalPolicySnapshotHash(p));
export const canonicalPurposeHashHex = (i: unknown) => bytesToHex(canonicalPurposeHash(i));
