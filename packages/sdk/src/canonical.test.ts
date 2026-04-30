import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  bytesToHex,
  canonicalPurposeHash,
  canonicalPurposeHashHex,
  canonicalReasonHash,
  canonicalReceiptHash,
  canonicalPolicySnapshotHash,
  CanonicalError,
  hexToBytes,
  purposeTextHash,
  stableStringify,
  type PurposeHashInput,
} from "./canonical.js";

const baseInput: PurposeHashInput = {
  request_id: "12345678-1234-4abc-9def-123456789abc",
  agent_card_pubkey: "Card1111111111111111111111111111111111111a", // 42 base58 chars
  pact_pubkey: null,
  merchant_pubkey: "Merch1111111111111111111111111111111111111", // 43 base58 chars
  capability_hash: "a".repeat(64),
  method: "POST",
  path: "/api/translate",
  amount_lamports: "500000",
  receipt_hash: "b".repeat(64),
  reason_hash: "c".repeat(64),
  policy_snapshot_hash: "d".repeat(64),
};

describe("canonicalPurposeHash — required spec tests", () => {
  it("(1) same fields produce same hash", () => {
    const a = canonicalPurposeHashHex(baseInput);
    const b = canonicalPurposeHashHex({ ...baseInput });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("(2) changed request_id produces different hash", () => {
    const a = canonicalPurposeHashHex(baseInput);
    const b = canonicalPurposeHashHex({
      ...baseInput,
      request_id: "fedcba98-1234-4abc-9def-cba987654321",
    });
    expect(a).not.toBe(b);
  });

  it("(3) changed capability_hash produces different hash", () => {
    const a = canonicalPurposeHashHex(baseInput);
    const b = canonicalPurposeHashHex({
      ...baseInput,
      capability_hash: "e".repeat(64),
    });
    expect(a).not.toBe(b);
  });

  it("(4) changed amount_lamports produces different hash", () => {
    const a = canonicalPurposeHashHex(baseInput);
    const b = canonicalPurposeHashHex({
      ...baseInput,
      amount_lamports: "500001",
    });
    expect(a).not.toBe(b);
  });

  it("(5) missing required field is rejected", () => {
    const { method: _omit, ...incomplete } = baseInput as Record<string, unknown>;
    void _omit;
    expect(() => canonicalPurposeHash(incomplete)).toThrow(ZodError);
  });
});

describe("canonicalPurposeHash — additional invariants", () => {
  it("rejects unknown extra fields (strict schema)", () => {
    expect(() =>
      canonicalPurposeHash({ ...baseInput, smuggled: "x" } as unknown),
    ).toThrow(ZodError);
  });

  it("input key order does not affect output hash", () => {
    const reordered = {
      receipt_hash: baseInput.receipt_hash,
      capability_hash: baseInput.capability_hash,
      method: baseInput.method,
      amount_lamports: baseInput.amount_lamports,
      path: baseInput.path,
      pact_pubkey: baseInput.pact_pubkey,
      reason_hash: baseInput.reason_hash,
      policy_snapshot_hash: baseInput.policy_snapshot_hash,
      request_id: baseInput.request_id,
      agent_card_pubkey: baseInput.agent_card_pubkey,
      merchant_pubkey: baseInput.merchant_pubkey,
    };
    expect(canonicalPurposeHashHex(reordered)).toBe(canonicalPurposeHashHex(baseInput));
  });

  it("rejects invalid hex hash (wrong length)", () => {
    expect(() =>
      canonicalPurposeHash({ ...baseInput, receipt_hash: "ab" }),
    ).toThrow(ZodError);
  });

  it("rejects uppercase hex (canonical form is lowercase)", () => {
    expect(() =>
      canonicalPurposeHash({ ...baseInput, receipt_hash: "A".repeat(64) }),
    ).toThrow(ZodError);
  });

  it("rejects path without leading slash", () => {
    expect(() =>
      canonicalPurposeHash({ ...baseInput, path: "no-slash" }),
    ).toThrow(ZodError);
  });

  it("rejects unknown HTTP method", () => {
    expect(() =>
      canonicalPurposeHash({ ...baseInput, method: "TRACE" as unknown as PurposeHashInput["method"] }),
    ).toThrow(ZodError);
  });

  it("changed method produces different hash", () => {
    const a = canonicalPurposeHashHex(baseInput);
    const b = canonicalPurposeHashHex({ ...baseInput, method: "GET" });
    expect(a).not.toBe(b);
  });

  it("changed path produces different hash", () => {
    const a = canonicalPurposeHashHex(baseInput);
    const b = canonicalPurposeHashHex({ ...baseInput, path: "/api/summary" });
    expect(a).not.toBe(b);
  });

  it("pact_pubkey null vs set produces different hash", () => {
    const a = canonicalPurposeHashHex(baseInput);
    const b = canonicalPurposeHashHex({
      ...baseInput,
      pact_pubkey: "Pact11111111111111111111111111111111111111",
    });
    expect(a).not.toBe(b);
  });
});

describe("stableStringify — canonical JSON rules", () => {
  it("sorts keys recursively", () => {
    expect(stableStringify({ b: 1, a: { z: 1, y: 2 } })).toBe('{"a":{"y":2,"z":1},"b":1}');
  });

  it("rejects undefined", () => {
    expect(() => stableStringify({ a: undefined })).toThrow(CanonicalError);
  });

  it("rejects BigInt", () => {
    expect(() => stableStringify({ a: 1n })).toThrow(CanonicalError);
  });

  it("rejects NaN / Infinity", () => {
    expect(() => stableStringify({ a: NaN })).toThrow(CanonicalError);
    expect(() => stableStringify({ a: Infinity })).toThrow(CanonicalError);
  });

  it("preserves array order (does not sort)", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("emits explicit null", () => {
    expect(stableStringify({ a: null })).toBe('{"a":null}');
  });
});

describe("hex helpers", () => {
  it("round-trips bytes through hex", () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it("rejects odd-length hex", () => {
    expect(() => hexToBytes("abc")).toThrow(CanonicalError);
  });

  it("rejects non-hex characters", () => {
    expect(() => hexToBytes("zz")).toThrow(CanonicalError);
  });
});

describe("purposeTextHash — NFC + trim normalization", () => {
  it("trims whitespace", () => {
    const a = bytesToHex(purposeTextHash("hello"));
    const b = bytesToHex(purposeTextHash("  hello  "));
    expect(a).toBe(b);
  });

  it("normalizes Unicode (NFC)", () => {
    // "é" can be one code point (U+00E9) or two (U+0065 U+0301). NFC collapses them.
    const composed = "café";
    const decomposed = "café";
    expect(bytesToHex(purposeTextHash(composed))).toBe(bytesToHex(purposeTextHash(decomposed)));
  });

  it("differentiates substantively different text", () => {
    expect(bytesToHex(purposeTextHash("buy gpu"))).not.toBe(
      bytesToHex(purposeTextHash("buy cpu")),
    );
  });
});

describe("subordinate canonical hashes", () => {
  const receipt = {
    request_id: baseInput.request_id,
    card_pubkey: baseInput.agent_card_pubkey,
    pact_pubkey: null,
    merchant_pubkey: baseInput.merchant_pubkey,
    amount_lamports: baseInput.amount_lamports,
    capability_hash: baseInput.capability_hash,
    purpose_text_hash: bytesToHex(purposeTextHash("translate this paper")),
    decision_slot: 12345,
    policy_version: 1,
  };

  it("canonicalReceiptHash is stable", () => {
    expect(bytesToHex(canonicalReceiptHash(receipt))).toBe(
      bytesToHex(canonicalReceiptHash({ ...receipt })),
    );
  });

  it("canonicalReceiptHash rejects missing field", () => {
    const { request_id: _drop, ...incomplete } = receipt;
    void _drop;
    expect(() => canonicalReceiptHash(incomplete)).toThrow(ZodError);
  });

  it("canonicalReasonHash is stable", () => {
    const reason = {
      decision: "ALLOW" as const,
      deny_code: 0,
      cap_remaining_after: "499500",
      per_call_max: "100000",
      allowlist_match: true,
      capability_pinned: true,
      merchant_verified: true,
      expiry_slot: 99999999,
      current_slot: 12345,
    };
    expect(bytesToHex(canonicalReasonHash(reason))).toBe(
      bytesToHex(canonicalReasonHash({ ...reason })),
    );
  });

  it("canonicalPolicySnapshotHash is stable", () => {
    const ps = {
      policy_version: 1,
      daily_cap: "1000000",
      per_call_max: "100000",
      allowlist_count: 3,
      expiry_slot: 99999999,
      revoked: false,
    };
    expect(bytesToHex(canonicalPolicySnapshotHash(ps))).toBe(
      bytesToHex(canonicalPolicySnapshotHash({ ...ps })),
    );
  });
});
