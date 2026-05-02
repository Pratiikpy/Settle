/**
 * Universal Receipt Kernel — F2.0.
 *
 * The wedge ("every payment proves itself") becomes universally true here:
 *
 *   For every payment kind — direct send, link send, x402 agent spend,
 *   streaming claim, escrow release, escrow dispute, refund — this kernel
 *   computes the same 4-hash commit chain (receipt, reason, policy_snapshot,
 *   purpose) and returns:
 *
 *     • hashes:   the 4 hashes ready for on-chain commit + DB storage
 *     • canonical: the canonical objects, kept around for re-verification +
 *                  RLS-filtered DB inserts
 *     • context_hash: a one-hash binding over (kind, sender, recipient,
 *                     amount, request_id) — the indexable identity of the
 *                     receipt, kind-aware
 *
 * Architectural notes:
 *
 * 1. **Path B (this file) vs Path A.** Path B is the off-chain shim — the
 *    kernel runs server-side, computes hashes, and (for non-Anchor flows)
 *    packs them into a Solana Memo program ix that rides alongside the
 *    payment in the same tx. Anyone can re-verify by reading the memo,
 *    re-hashing the canonical inputs from the DB, and comparing.
 *
 *    Path A (Anchor program v0.4) lifts the kernel into a `record_receipt`
 *    instruction so the on-chain program enforces the commit chain
 *    natively. Path A is strictly stronger; Path B is what unblocks Phase
 *    1 features RIGHT NOW without a program redeploy.
 *
 * 2. **Why a discriminated union by `kind`.** Every payment kind has
 *    different state on hand (an x402 agent spend has full AgentCard +
 *    Pact context; a direct send has only sender + recipient + amount).
 *    A flat optional-field schema would mean "every consumer of this
 *    library has to know which fields apply when." The discriminated
 *    union pushes that into the schema itself — the type system rejects a
 *    direct_send with a missing-but-required-only-for-x402 field at the
 *    call site, before any hashing happens.
 *
 * 3. **Trivial policy snapshots.** For payment kinds without an AgentCard
 *    (direct_send, link_send), we still emit a CanonicalPolicySnapshot —
 *    a TRIVIAL one with `daily_cap = "0"`, `revoked = false`, etc. This
 *    keeps the verifier code-path uniform: every receipt has 4 hashes,
 *    even when the policy is "no on-chain policy applies."
 *
 *    The verifier can detect a trivial policy via the kind field and the
 *    fact that all caps are "0". For dashboards that want to filter
 *    "policy-enforced payments only", filter on kind ∈ {x402_spend,
 *    streaming_claim, escrow_*}.
 */

import { z } from "zod";
import { blake3 } from "@noble/hashes/blake3";
import {
  bytesToHex,
  canonicalPolicySnapshotHash,
  canonicalPurposeHash,
  canonicalReasonHash,
  canonicalReceiptHash,
  CanonicalReceiptSchema,
  purposeTextHash,
  stableStringify,
  type CanonicalPolicySnapshot,
  type CanonicalReason,
  type CanonicalReceipt,
} from "./canonical.js";

// ─────────────────────────────────────────────────────────────────────────────
// Receipt kinds — every payment that flows through Settle is one of these.
// ─────────────────────────────────────────────────────────────────────────────

export const ReceiptKind = z.enum([
  "x402_spend", // existing — agent x402 agent-rail flow
  "direct_send", // user-signed direct USDC transfer (no AgentCard)
  "link_send", // pre-funded payment link claim
  "streaming_claim", // agent claim from a streaming pact
  "escrow_release", // delivery escrow released to merchant
  "escrow_dispute", // delivery escrow disputed → buyer refund
  "refund", // post-receipt refund (any kind of receipt)
]);
export type ReceiptKindT = z.infer<typeof ReceiptKind>;

// ─────────────────────────────────────────────────────────────────────────────
// Common field schemas — same across every kind.
// ─────────────────────────────────────────────────────────────────────────────

const Pubkey = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "base58 pubkey");
const Hex32 = z.string().regex(/^[0-9a-f]{64}$/, "32-byte lowercase hex (64 chars)");
const Decimal = z.string().regex(/^\d+$/, "non-negative decimal string");
const Uuid = z.string().uuid();
const HttpMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const HttpPath = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^\/[^\s]*$/, "must start with '/' and contain no whitespace");

// Common base — every kind supplies these.
const BaseInputShape = {
  request_id: Uuid,
  amount_lamports: Decimal,
  /** The wallet whose USDC moves (buyer, payer, sender). */
  sender: Pubkey,
  /** The wallet that receives the USDC (merchant, recipient, claimant). */
  recipient: Pubkey,
  decision_slot: z.number().int().nonnegative(),
  purpose_text: z.string().min(1).max(2048),
  /** ALLOW for happy-path payments; DENY for record_denial; REVIEW for soft-deny. */
  decision: z.enum(["ALLOW", "DENY", "REVIEW"]).default("ALLOW"),
  deny_code: z.number().int().min(0).max(8).default(0),
} as const;

// Card context — kinds bound to an AgentCard supply this.
const CardContextShape = {
  card_pubkey: Pubkey,
  pact_pubkey: Pubkey.nullable(),
  capability_hash: Hex32,
  policy_version: z.number().int().nonnegative(),
  daily_cap_lamports: Decimal,
  per_call_max_lamports: Decimal,
  allowlist_count: z.number().int().min(0).max(10),
  expiry_slot: z.number().int().nonnegative(),
  revoked: z.boolean(),
  /** Cap remaining AFTER this decision applies (= daily_cap - used_today - amount). */
  cap_remaining_after: Decimal,
} as const;

// HTTP context — only x402_spend has this (the spend is bound to an HTTP request).
const HttpContextShape = {
  http_method: HttpMethod,
  http_path: HttpPath,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind discriminated union.
//
// Type system enforces: a `kind: "direct_send"` cannot supply a card_pubkey;
// a `kind: "x402_spend"` MUST supply card + http context; etc.
// ─────────────────────────────────────────────────────────────────────────────

export const ReceiptInputSchema = z.discriminatedUnion("kind", [
  // x402 agent spend — full card + http context
  z.object({
    kind: z.literal("x402_spend"),
    ...BaseInputShape,
    ...CardContextShape,
    ...HttpContextShape,
  }),

  // Direct user-signed USDC transfer — no AgentCard, no Pact
  z.object({
    kind: z.literal("direct_send"),
    ...BaseInputShape,
  }),

  // Pre-funded payment link claim — no card, but a link_token references the source
  z.object({
    kind: z.literal("link_send"),
    ...BaseInputShape,
    /** Opaque token identifying the link-funded vault (DB-assigned). */
    link_token: z.string().min(8).max(128),
  }),

  // Streaming claim — agent draws from a streaming pact
  z.object({
    kind: z.literal("streaming_claim"),
    ...BaseInputShape,
    ...CardContextShape,
    /** Slots elapsed since last claim that are billable (excluding paused). */
    billable_slots: z.number().int().nonnegative(),
  }),

  // Delivery escrow released to merchant
  z.object({
    kind: z.literal("escrow_release"),
    ...BaseInputShape,
    ...CardContextShape,
    /** True when buyer confirmed early; false when permissionless post-deadline. */
    buyer_confirmed: z.boolean(),
  }),

  // Delivery escrow disputed → buyer refund
  z.object({
    kind: z.literal("escrow_dispute"),
    ...BaseInputShape,
    ...CardContextShape,
  }),

  // Post-receipt refund — references the original receipt by request_id
  z.object({
    kind: z.literal("refund"),
    ...BaseInputShape,
    /** request_id of the original receipt that this refund is for. */
    refund_of_request_id: Uuid,
    /** Reason text shown to the merchant. Pre-canonicalized: trim + NFC. */
    refund_reason: z.string().min(1).max(2048),
  }),
]);
export type ReceiptInput = z.infer<typeof ReceiptInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Internal: build CanonicalReceipt / Reason / PolicySnapshot from any kind.
//
// For kinds without an AgentCard, we synthesize a TRIVIAL policy snapshot
// (caps all "0", revoked false). This keeps the verifier code-path uniform:
// every receipt has 4 hashes, regardless of whether on-chain policy applies.
// ─────────────────────────────────────────────────────────────────────────────

const ZERO_HASH_HEX = "0".repeat(64);

function buildCanonicalReceipt(input: ReceiptInput, purposeTextHashHex: string): CanonicalReceipt {
  // For card-bound kinds, use real card_pubkey; otherwise the sender is the
  // closest equivalent ("the wallet authorizing the spend"). The schema is
  // still satisfied — the receipt_hash binds whatever we put in here.
  const card_pubkey =
    "card_pubkey" in input ? input.card_pubkey : input.sender;
  const pact_pubkey = "pact_pubkey" in input ? input.pact_pubkey : null;
  const capability_hash =
    "capability_hash" in input ? input.capability_hash : ZERO_HASH_HEX;
  const policy_version = "policy_version" in input ? input.policy_version : 0;

  const receipt: CanonicalReceipt = {
    request_id: input.request_id,
    card_pubkey,
    pact_pubkey,
    merchant_pubkey: input.recipient,
    amount_lamports: input.amount_lamports,
    capability_hash,
    purpose_text_hash: purposeTextHashHex,
    decision_slot: input.decision_slot,
    policy_version,
  };
  return CanonicalReceiptSchema.parse(receipt);
}

function buildCanonicalReason(input: ReceiptInput): CanonicalReason {
  // For non-card-bound kinds (direct_send, link_send, refund), the reason is
  // a "trivial allow" — user signed, no policy applies. allowlist_match=true
  // and capability_pinned=false reflects "the user authorized the recipient
  // by signing" — no on-chain allowlist check happened, but there's also
  // nothing to deny.
  const isCardBound = "card_pubkey" in input;
  return {
    decision: input.decision,
    deny_code: input.deny_code,
    cap_remaining_after: isCardBound ? input.cap_remaining_after : "0",
    per_call_max: isCardBound ? input.per_call_max_lamports : "0",
    allowlist_match: isCardBound ? true : true, // user signing IS the allowlist
    capability_pinned: isCardBound ? "capability_hash" in input : false,
    merchant_verified: false, // SAS lookup is the caller's job; we record the input
    expiry_slot: isCardBound ? input.expiry_slot : 0,
    current_slot: input.decision_slot,
  };
}

function buildCanonicalPolicySnapshot(input: ReceiptInput): CanonicalPolicySnapshot {
  if ("card_pubkey" in input) {
    return {
      policy_version: input.policy_version,
      daily_cap: input.daily_cap_lamports,
      per_call_max: input.per_call_max_lamports,
      allowlist_count: input.allowlist_count,
      expiry_slot: input.expiry_slot,
      revoked: input.revoked,
    };
  }
  // Trivial snapshot — no on-chain policy applies.
  return {
    policy_version: 0,
    daily_cap: "0",
    per_call_max: "0",
    allowlist_count: 0,
    expiry_slot: 0,
    revoked: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// kernelCommit — the universal receipt builder.
//
// Returns the 4 hashes + canonical objects + a kind-aware context_hash that
// can be used as an indexable identity.
// ─────────────────────────────────────────────────────────────────────────────

export interface KernelCommitResult {
  kind: ReceiptKindT;
  hashes: {
    purpose_text_hash: string;
    receipt_hash: string;
    reason_hash: string;
    policy_snapshot_hash: string;
    purpose_hash: string;
  };
  canonical: {
    receipt: CanonicalReceipt;
    reason: CanonicalReason;
    policy_snapshot: CanonicalPolicySnapshot;
  };
  /**
   * BLAKE3({ kind, sender, recipient, amount_lamports, request_id }).
   * Indexable identity of the receipt — kind-aware. Lets a verifier locate a
   * receipt without needing to know its 4 hashes upfront.
   */
  context_hash: string;
}

export function kernelCommit(rawInput: unknown): KernelCommitResult {
  const input = ReceiptInputSchema.parse(rawInput);

  const purpose_text_hash = bytesToHex(purposeTextHash(input.purpose_text));
  const receipt = buildCanonicalReceipt(input, purpose_text_hash);
  const reason = buildCanonicalReason(input);
  const policy_snapshot = buildCanonicalPolicySnapshot(input);

  const receipt_hash = bytesToHex(canonicalReceiptHash(receipt));
  const reason_hash = bytesToHex(canonicalReasonHash(reason));
  const policy_snapshot_hash = bytesToHex(canonicalPolicySnapshotHash(policy_snapshot));

  // For non-x402 kinds we don't have HTTP context; use synthetic POST + path
  // derived from the kind. The purpose_hash binds these so a verifier can
  // recompute them.
  const http_method = "http_method" in input ? input.http_method : "POST";
  const http_path = "http_path" in input ? input.http_path : `/_kernel/${input.kind}`;

  const purpose_hash = bytesToHex(
    canonicalPurposeHash({
      request_id: receipt.request_id,
      agent_card_pubkey: receipt.card_pubkey,
      pact_pubkey: receipt.pact_pubkey,
      merchant_pubkey: receipt.merchant_pubkey,
      capability_hash: receipt.capability_hash,
      method: http_method,
      path: http_path,
      amount_lamports: receipt.amount_lamports,
      receipt_hash,
      reason_hash,
      policy_snapshot_hash,
    }),
  );

  const context_hash = bytesToHex(
    blake3(
      new TextEncoder().encode(
        stableStringify({
          kind: input.kind,
          sender: input.sender,
          recipient: input.recipient,
          amount_lamports: input.amount_lamports,
          request_id: input.request_id,
        }),
      ),
    ),
  );

  return {
    kind: input.kind,
    hashes: {
      purpose_text_hash,
      receipt_hash,
      reason_hash,
      policy_snapshot_hash,
      purpose_hash,
    },
    canonical: { receipt, reason, policy_snapshot },
    context_hash,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Memo encoding — for non-Anchor-routed kinds, the 4 hashes ride on a Solana
// Memo program ix in the same tx as the SPL TransferChecked.
//
// Format (binary, base64url-encoded for the memo string field):
//
//   [4 bytes "STLE" magic][1 byte version=1][1 byte kind tag]
//   [32 receipt][32 reason][32 policy_snapshot][32 purpose]
//   [optional 64-byte ed25519 signature over (magic || version || kind || hashes)]
//
// Total: 134 bytes unsigned, 198 bytes signed. Both fit comfortably under
// Memo program's 566-byte UTF-8 cap (base64url adds ~33% → 180 / 264 chars).
// ─────────────────────────────────────────────────────────────────────────────

export const KERNEL_MEMO_MAGIC = new TextEncoder().encode("STLE");
export const KERNEL_MEMO_VERSION = 1;
const KIND_TAG: Record<ReceiptKindT, number> = {
  x402_spend: 1,
  direct_send: 2,
  link_send: 3,
  streaming_claim: 4,
  escrow_release: 5,
  escrow_dispute: 6,
  refund: 7,
};
const KIND_BY_TAG = Object.fromEntries(
  Object.entries(KIND_TAG).map(([k, v]) => [v, k as ReceiptKindT]),
) as Record<number, ReceiptKindT>;

/** Pack hashes into the 134-byte unsigned kernel memo body (198 bytes signed). */
export function packKernelMemo(args: {
  kind: ReceiptKindT;
  hashes: KernelCommitResult["hashes"];
  signature?: Uint8Array;
}): Uint8Array {
  const { kind, hashes, signature } = args;
  const tag = KIND_TAG[kind];
  const body = new Uint8Array(4 + 1 + 1 + 32 * 4 + (signature ? 64 : 0));
  let off = 0;
  body.set(KERNEL_MEMO_MAGIC, off);
  off += 4;
  body[off++] = KERNEL_MEMO_VERSION;
  body[off++] = tag;
  body.set(hexToFixed32(hashes.receipt_hash), off);
  off += 32;
  body.set(hexToFixed32(hashes.reason_hash), off);
  off += 32;
  body.set(hexToFixed32(hashes.policy_snapshot_hash), off);
  off += 32;
  body.set(hexToFixed32(hashes.purpose_hash), off);
  off += 32;
  if (signature) {
    if (signature.length !== 64) throw new Error("kernel memo: signature must be 64 bytes");
    body.set(signature, off);
  }
  return body;
}

/** Inverse of packKernelMemo. Throws on malformed bytes. */
export function unpackKernelMemo(bytes: Uint8Array): {
  kind: ReceiptKindT;
  hashes: KernelCommitResult["hashes"];
  signature: Uint8Array | null;
} {
  if (bytes.length !== 134 && bytes.length !== 198) {
    throw new Error(
      `kernel memo: expected 134 or 198 bytes, got ${bytes.length}`,
    );
  }
  const magic = bytes.subarray(0, 4);
  for (let i = 0; i < 4; i++) {
    if (magic[i] !== KERNEL_MEMO_MAGIC[i]) {
      throw new Error("kernel memo: magic mismatch (not a Settle receipt memo)");
    }
  }
  const version = bytes[4];
  if (version !== KERNEL_MEMO_VERSION) {
    throw new Error(`kernel memo: unsupported version ${version}`);
  }
  const tag = bytes[5];
  const kind = KIND_BY_TAG[tag!];
  if (!kind) throw new Error(`kernel memo: unknown kind tag ${tag}`);

  const hashes = {
    purpose_text_hash: ZERO_HASH_HEX, // not in memo (it's redundant — receipt_hash binds it)
    receipt_hash: bytesToHex(bytes.subarray(6, 6 + 32)),
    reason_hash: bytesToHex(bytes.subarray(38, 38 + 32)),
    policy_snapshot_hash: bytesToHex(bytes.subarray(70, 70 + 32)),
    purpose_hash: bytesToHex(bytes.subarray(102, 102 + 32)),
  };

  const signature = bytes.length === 198 ? bytes.subarray(134, 198) : null;
  return { kind, hashes, signature };
}

function hexToFixed32(hex: string): Uint8Array {
  if (hex.length !== 64) {
    throw new Error(`hex must be 64 chars (32 bytes), got ${hex.length}`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Returns the bytes that an operator key signs to attest the kernel commit.
 * Signing exposes one bit of trust: "Settle's facilitator endorsed these
 * hashes." Without a sig, the hashes still verify against the canonical
 * objects — the sig just adds operator-level provenance.
 */
export function kernelMemoSignableBytes(args: {
  kind: ReceiptKindT;
  hashes: KernelCommitResult["hashes"];
}): Uint8Array {
  // Pack everything except the signature itself, then return that prefix.
  const unsigned = packKernelMemo(args);
  return unsigned;
}

// ─────────────────────────────────────────────────────────────────────────────
// F2.0 Path A — `record_receipt` ix arg shape.
//
// Shape that the Anchor program v0.4 ix expects. Builders in the web app's
// `anchor-client.ts` consume this. Callers do NOT need @solana/web3.js in
// scope — they just need the raw hashes (Uint8Array) and kind tag.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordReceiptArgs {
  kind: number; // 1..7 — see KIND_TAG
  receiptHash: Uint8Array;
  reasonHash: Uint8Array;
  policySnapshotHash: Uint8Array;
  purposeHash: Uint8Array;
  contextHash: Uint8Array;
}

/**
 * Convert a `kernelCommit()` result into the bytes/args needed for the
 * Path A `record_receipt` ix. The returned args go straight into
 * `recordReceiptIx({ attestor, args })` from @settle/web's anchor-client.
 */
export function kernelCommitToRecordReceiptArgs(
  result: KernelCommitResult,
): RecordReceiptArgs {
  const hexToBytes = (hex: string): Uint8Array => {
    if (hex.length !== 64) throw new Error(`expected 64-char hex, got ${hex.length}`);
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  };
  return {
    kind: KIND_TAG[result.kind],
    receiptHash: hexToBytes(result.hashes.receipt_hash),
    reasonHash: hexToBytes(result.hashes.reason_hash),
    policySnapshotHash: hexToBytes(result.hashes.policy_snapshot_hash),
    purposeHash: hexToBytes(result.hashes.purpose_hash),
    contextHash: hexToBytes(result.context_hash),
  };
}
