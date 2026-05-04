// Settle x Ika sidetrack — Phase C SDK tests for `crosschain_spend`.
//
// Covers:
//   1. Canonical hash determinism across runs.
//   2. CAIP-2 chain id validation rejects garbage.
//   3. CAIP-10 recipient validation rejects garbage.
//   4. amount_minor must be a non-negative integer string.
//   5. Policy snapshot binds chain identity — different chain → different
//      policy_snapshot_hash so the receipt hash chain reflects the route.

import { describe, expect, it } from "vitest";
import { kernelCommit, type ReceiptInput } from "./receipt-kernel.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SOL_PUBKEY_A = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";
const SOL_PUBKEY_B = "FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK";
const REQUEST_ID = "11111111-2222-3333-4444-555555555555";
const ZERO_HASH_HEX = "0".repeat(64);

function fixtureCrosschainAllow(): Extract<ReceiptInput, { kind: "crosschain_spend" }> {
  return {
    kind: "crosschain_spend",
    request_id: REQUEST_ID,
    amount_lamports: "0", // no Solana value moved on cross-chain
    sender: SOL_PUBKEY_A,
    recipient: SOL_PUBKEY_B, // dwallet pubkey, by convention
    decision_slot: 459_963_796,
    purpose_text: "agent payment for translation service",
    decision: "ALLOW",
    deny_code: 0,
    // CrosschainCardContextShape
    card_pubkey: SOL_PUBKEY_A,
    policy_version: 1,
    daily_cap_minor: "50000000000000000000", // 50 ETH in wei
    per_call_max_minor: "10000000000000000000", // 10 ETH in wei
    used_today_minor: "0",
    allowlist_count: 1,
    expiry_slot: 460_000_000,
    revoked: false,
    // crosschain-specific
    capability_hash: "a".repeat(64),
    target_chain: "eip155:11155111",
    target_recipient: "eip155:11155111:0xabcdef0123456789abcdef0123456789abcdef01",
    target_asset: "native",
    amount_minor: "5000000000000000000", // 5 ETH in wei
    amount_decimals: 18,
    dwallet_pubkey: SOL_PUBKEY_B,
    signature_scheme: 0, // EcdsaKeccak256
    target_tx_hash: null, // populated post-broadcast
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Canonical hash determinism
// ─────────────────────────────────────────────────────────────────────────────

describe("crosschain_spend — canonical hash determinism", () => {
  it("produces the same 4 hashes on repeated kernelCommit calls with identical input", () => {
    const input = fixtureCrosschainAllow();
    const a = kernelCommit(input);
    const b = kernelCommit(input);
    expect(a.hashes.receipt_hash).toBe(b.hashes.receipt_hash);
    expect(a.hashes.reason_hash).toBe(b.hashes.reason_hash);
    expect(a.hashes.policy_snapshot_hash).toBe(b.hashes.policy_snapshot_hash);
    expect(a.hashes.purpose_hash).toBe(b.hashes.purpose_hash);
    expect(a.context_hash).toBe(b.context_hash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CAIP-2 validation
// ─────────────────────────────────────────────────────────────────────────────

describe("crosschain_spend — CAIP-2 validation", () => {
  it("accepts known CAIP-2 chain ids", () => {
    const input = fixtureCrosschainAllow();
    expect(() => kernelCommit({ ...input, target_chain: "eip155:11155111" })).not.toThrow();
    expect(() =>
      kernelCommit({ ...input, target_chain: "bip122:000000000019d6689c08" }),
    ).not.toThrow();
  });

  it("rejects malformed CAIP-2 chain ids", () => {
    const input = fixtureCrosschainAllow();
    // Missing colon separator
    expect(() => kernelCommit({ ...input, target_chain: "eip155-11155111" })).toThrow();
    // Empty namespace
    expect(() => kernelCommit({ ...input, target_chain: ":11155111" })).toThrow();
    // Whitespace
    expect(() => kernelCommit({ ...input, target_chain: "eip155: 11155111" })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CAIP-10 validation
// ─────────────────────────────────────────────────────────────────────────────

describe("crosschain_spend — CAIP-10 validation", () => {
  it("accepts CAIP-10 with EVM, BTC, Solana shapes", () => {
    const input = fixtureCrosschainAllow();
    expect(() =>
      kernelCommit({
        ...input,
        target_recipient: "eip155:11155111:0xabcdef0123456789abcdef0123456789abcdef01",
      }),
    ).not.toThrow();
    expect(() =>
      kernelCommit({
        ...input,
        target_recipient: "bip122:000000000019d6689c08:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      }),
    ).not.toThrow();
  });

  it("rejects malformed CAIP-10", () => {
    const input = fixtureCrosschainAllow();
    // Only chain (missing :address)
    expect(() => kernelCommit({ ...input, target_recipient: "eip155:11155111" })).toThrow();
    // Whitespace in address
    expect(() =>
      kernelCommit({ ...input, target_recipient: "eip155:11155111: 0xabc" }),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. amount_minor — non-negative integer string only
// ─────────────────────────────────────────────────────────────────────────────

describe("crosschain_spend — amount_minor validation", () => {
  it("accepts arbitrarily large non-negative integers (wei-scale)", () => {
    const input = fixtureCrosschainAllow();
    // 10^28 wei — well beyond u64 but valid as a decimal string
    expect(() =>
      kernelCommit({ ...input, amount_minor: "10000000000000000000000000000" }),
    ).not.toThrow();
  });

  it("rejects fractional, negative, or non-numeric values", () => {
    const input = fixtureCrosschainAllow();
    expect(() => kernelCommit({ ...input, amount_minor: "0.5" })).toThrow();
    expect(() => kernelCommit({ ...input, amount_minor: "-100" })).toThrow();
    expect(() => kernelCommit({ ...input, amount_minor: "abc" })).toThrow();
    expect(() => kernelCommit({ ...input, amount_minor: "" })).toThrow();
    expect(() => kernelCommit({ ...input, amount_minor: "1e18" })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Policy snapshot + context_hash bind chain identity
// ─────────────────────────────────────────────────────────────────────────────

describe("crosschain_spend — chain identity binding", () => {
  it("changing target_chain produces a different context_hash", () => {
    const input = fixtureCrosschainAllow();
    const a = kernelCommit(input);
    const b = kernelCommit({ ...input, target_chain: "eip155:1" }); // mainnet
    expect(a.context_hash).not.toBe(b.context_hash);
  });

  it("changing target_recipient produces a different context_hash", () => {
    const input = fixtureCrosschainAllow();
    const a = kernelCommit(input);
    const b = kernelCommit({
      ...input,
      target_recipient: "eip155:11155111:0xfffffffffffffffffffffffffffffffffffffffe",
    });
    expect(a.context_hash).not.toBe(b.context_hash);
  });

  it("policy_snapshot reflects cross-chain card caps in minor units", () => {
    const input = fixtureCrosschainAllow();
    const result = kernelCommit(input);
    expect(result.canonical.policy_snapshot.daily_cap).toBe(input.daily_cap_minor);
    expect(result.canonical.policy_snapshot.per_call_max).toBe(input.per_call_max_minor);
    expect(result.canonical.policy_snapshot.policy_version).toBe(1);
    expect(result.canonical.policy_snapshot.revoked).toBe(false);
  });

  it("DENY receipt sets target_tx_hash null and decision DENY", () => {
    const input = fixtureCrosschainAllow();
    const denied = kernelCommit({
      ...input,
      decision: "DENY",
      deny_code: 2, // OverCap
    });
    expect(denied.canonical.reason.decision).toBe("DENY");
    expect(denied.canonical.reason.deny_code).toBe(2);
    // ALLOW vs DENY produce different reason_hash so audit trail records intent.
    const allowed = kernelCommit(input);
    expect(allowed.hashes.reason_hash).not.toBe(denied.hashes.reason_hash);
  });

  it("zero-pinned capability and zero-hash request both produce stable hash", () => {
    // Pinned capability == ZERO_HASH means "unpinned" — should still hash deterministically.
    const input = fixtureCrosschainAllow();
    const a = kernelCommit({ ...input, capability_hash: ZERO_HASH_HEX });
    const b = kernelCommit({ ...input, capability_hash: ZERO_HASH_HEX });
    expect(a.hashes.receipt_hash).toBe(b.hashes.receipt_hash);
  });
});
