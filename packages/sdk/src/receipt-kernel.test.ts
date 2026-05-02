import { describe, expect, it } from "vitest";
import {
  kernelCommit,
  packKernelMemo,
  unpackKernelMemo,
  KERNEL_MEMO_MAGIC,
  KERNEL_MEMO_VERSION,
  type ReceiptKindT,
} from "./receipt-kernel.js";

const PUBKEY_A = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";
const PUBKEY_B = "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY";
const PUBKEY_C = "D1D2carRxhUPDuW5QCvp2gvx39LuSLEhNX2VyFjbKUD8";
const ZERO_HASH = "0".repeat(64);
const SAMPLE_HASH = "a".repeat(64);
const UUID = "11111111-2222-3333-4444-555555555555";
const UUID_2 = "22222222-3333-4444-5555-666666666666";

describe("kernelCommit — discriminated union by kind", () => {
  it("direct_send produces all 4 hashes with trivial policy", () => {
    const result = kernelCommit({
      kind: "direct_send",
      request_id: UUID,
      amount_lamports: "500000",
      sender: PUBKEY_A,
      recipient: PUBKEY_B,
      decision_slot: 1000,
      purpose_text: "coffee with alice",
    });
    expect(result.kind).toBe("direct_send");
    expect(result.hashes.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.hashes.reason_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.hashes.policy_snapshot_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.hashes.purpose_hash).toMatch(/^[0-9a-f]{64}$/);
    // trivial policy snapshot
    expect(result.canonical.policy_snapshot.daily_cap).toBe("0");
    expect(result.canonical.policy_snapshot.revoked).toBe(false);
    expect(result.canonical.policy_snapshot.allowlist_count).toBe(0);
    // sender becomes the card_pubkey for non-card-bound kinds
    expect(result.canonical.receipt.card_pubkey).toBe(PUBKEY_A);
    expect(result.canonical.receipt.pact_pubkey).toBeNull();
  });

  it("x402_spend produces all 4 hashes with real card+http context", () => {
    const result = kernelCommit({
      kind: "x402_spend",
      request_id: UUID,
      amount_lamports: "500000",
      sender: PUBKEY_A,
      recipient: PUBKEY_B,
      decision_slot: 1000,
      purpose_text: "translate paper",
      decision: "ALLOW",
      // card context
      card_pubkey: PUBKEY_C,
      pact_pubkey: null,
      capability_hash: SAMPLE_HASH,
      policy_version: 1,
      daily_cap_lamports: "10000000",
      per_call_max_lamports: "2000000",
      allowlist_count: 1,
      expiry_slot: 999_999_999,
      revoked: false,
      cap_remaining_after: "9500000",
      // http context
      http_method: "POST",
      http_path: "/v1/translate",
    });
    expect(result.kind).toBe("x402_spend");
    expect(result.canonical.receipt.card_pubkey).toBe(PUBKEY_C);
    expect(result.canonical.policy_snapshot.daily_cap).toBe("10000000");
    expect(result.canonical.reason.allowlist_match).toBe(true);
    expect(result.canonical.reason.capability_pinned).toBe(true);
  });

  it("link_send rejects with no link_token", () => {
    expect(() =>
      kernelCommit({
        kind: "link_send",
        request_id: UUID,
        amount_lamports: "100",
        sender: PUBKEY_A,
        recipient: PUBKEY_B,
        decision_slot: 1,
        purpose_text: "x",
      } as any),
    ).toThrow();
  });

  it("rejects unknown kind", () => {
    expect(() =>
      kernelCommit({
        kind: "not_a_real_kind",
        request_id: UUID,
        amount_lamports: "1",
        sender: PUBKEY_A,
        recipient: PUBKEY_B,
        decision_slot: 0,
        purpose_text: "x",
      } as any),
    ).toThrow();
  });

  it("refund references the original request_id", () => {
    const result = kernelCommit({
      kind: "refund",
      request_id: UUID,
      amount_lamports: "500000",
      sender: PUBKEY_A,
      recipient: PUBKEY_B,
      decision_slot: 100,
      purpose_text: "refund: not delivered",
      refund_of_request_id: UUID_2,
      refund_reason: "merchant didn't deliver",
    });
    expect(result.kind).toBe("refund");
    expect(result.canonical.policy_snapshot.daily_cap).toBe("0");
  });

  it("streaming_claim carries billable_slots", () => {
    const result = kernelCommit({
      kind: "streaming_claim",
      request_id: UUID,
      amount_lamports: "100000",
      sender: PUBKEY_A,
      recipient: PUBKEY_B,
      decision_slot: 1000,
      purpose_text: "salary tick",
      card_pubkey: PUBKEY_C,
      pact_pubkey: PUBKEY_C,
      capability_hash: SAMPLE_HASH,
      policy_version: 1,
      daily_cap_lamports: "10000000",
      per_call_max_lamports: "1000000",
      allowlist_count: 1,
      expiry_slot: 999_999,
      revoked: false,
      cap_remaining_after: "9900000",
      billable_slots: 100,
    });
    expect(result.kind).toBe("streaming_claim");
  });

  it("escrow_release captures buyer_confirmed", () => {
    const result = kernelCommit({
      kind: "escrow_release",
      request_id: UUID,
      amount_lamports: "1000000",
      sender: PUBKEY_A,
      recipient: PUBKEY_B,
      decision_slot: 1000,
      purpose_text: "delivery confirmed",
      card_pubkey: PUBKEY_C,
      pact_pubkey: PUBKEY_C,
      capability_hash: SAMPLE_HASH,
      policy_version: 1,
      daily_cap_lamports: "10000000",
      per_call_max_lamports: "5000000",
      allowlist_count: 1,
      expiry_slot: 999_999,
      revoked: false,
      cap_remaining_after: "9000000",
      buyer_confirmed: true,
    });
    expect(result.kind).toBe("escrow_release");
  });
});

describe("kernelCommit determinism", () => {
  it("identical inputs produce identical hashes", () => {
    const input = {
      kind: "direct_send" as const,
      request_id: UUID,
      amount_lamports: "1000",
      sender: PUBKEY_A,
      recipient: PUBKEY_B,
      decision_slot: 50,
      purpose_text: "test",
    };
    const a = kernelCommit(input);
    const b = kernelCommit(input);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.context_hash).toBe(b.context_hash);
  });

  it("different amount changes receipt_hash + context_hash", () => {
    const base = {
      kind: "direct_send" as const,
      request_id: UUID,
      sender: PUBKEY_A,
      recipient: PUBKEY_B,
      decision_slot: 50,
      purpose_text: "test",
    };
    const a = kernelCommit({ ...base, amount_lamports: "1000" });
    const b = kernelCommit({ ...base, amount_lamports: "2000" });
    expect(a.hashes.receipt_hash).not.toBe(b.hashes.receipt_hash);
    expect(a.context_hash).not.toBe(b.context_hash);
  });

  it("kind affects context_hash even for same sender/recipient/amount", () => {
    const base = {
      request_id: UUID,
      amount_lamports: "1000",
      sender: PUBKEY_A,
      recipient: PUBKEY_B,
      decision_slot: 50,
      purpose_text: "test",
    };
    const a = kernelCommit({ ...base, kind: "direct_send" });
    const b = kernelCommit({
      ...base,
      kind: "refund",
      refund_of_request_id: UUID_2,
      refund_reason: "y",
    });
    expect(a.context_hash).not.toBe(b.context_hash);
  });
});

describe("packKernelMemo / unpackKernelMemo round-trip", () => {
  const sampleHashes = {
    purpose_text_hash: ZERO_HASH,
    receipt_hash: "11".repeat(32),
    reason_hash: "22".repeat(32),
    policy_snapshot_hash: "33".repeat(32),
    purpose_hash: "44".repeat(32),
  };

  it("unsigned: packs to 134 bytes", () => {
    const packed = packKernelMemo({ kind: "direct_send", hashes: sampleHashes });
    expect(packed.length).toBe(134);
    expect(packed.subarray(0, 4)).toEqual(KERNEL_MEMO_MAGIC);
    expect(packed[4]).toBe(KERNEL_MEMO_VERSION);
    expect(packed[5]).toBe(2); // direct_send kind tag
  });

  it("signed: packs to 198 bytes", () => {
    const sig = new Uint8Array(64).fill(0xab);
    const packed = packKernelMemo({
      kind: "x402_spend",
      hashes: sampleHashes,
      signature: sig,
    });
    expect(packed.length).toBe(198);
  });

  it("rejects malformed sig length", () => {
    expect(() =>
      packKernelMemo({
        kind: "direct_send",
        hashes: sampleHashes,
        signature: new Uint8Array(63),
      }),
    ).toThrow();
  });

  it("round-trips every kind", () => {
    const kinds: ReceiptKindT[] = [
      "x402_spend",
      "direct_send",
      "link_send",
      "streaming_claim",
      "escrow_release",
      "escrow_dispute",
      "refund",
    ];
    for (const kind of kinds) {
      const packed = packKernelMemo({ kind, hashes: sampleHashes });
      const unpacked = unpackKernelMemo(packed);
      expect(unpacked.kind).toBe(kind);
      expect(unpacked.hashes.receipt_hash).toBe(sampleHashes.receipt_hash);
      expect(unpacked.hashes.reason_hash).toBe(sampleHashes.reason_hash);
      expect(unpacked.hashes.policy_snapshot_hash).toBe(sampleHashes.policy_snapshot_hash);
      expect(unpacked.hashes.purpose_hash).toBe(sampleHashes.purpose_hash);
      expect(unpacked.signature).toBeNull();
    }
  });

  it("round-trips with signature", () => {
    const sig = new Uint8Array(64).map((_, i) => i);
    const packed = packKernelMemo({
      kind: "direct_send",
      hashes: sampleHashes,
      signature: sig,
    });
    const unpacked = unpackKernelMemo(packed);
    expect(unpacked.signature).toEqual(sig);
  });

  it("rejects wrong magic", () => {
    const packed = packKernelMemo({ kind: "direct_send", hashes: sampleHashes });
    packed[0] = 0x00; // corrupt magic
    expect(() => unpackKernelMemo(packed)).toThrow(/magic/);
  });

  it("rejects wrong version", () => {
    const packed = packKernelMemo({ kind: "direct_send", hashes: sampleHashes });
    packed[4] = 99;
    expect(() => unpackKernelMemo(packed)).toThrow(/version/);
  });

  it("rejects wrong length", () => {
    expect(() => unpackKernelMemo(new Uint8Array(50))).toThrow(/134 or 198/);
  });

  it("rejects unknown kind tag", () => {
    const packed = packKernelMemo({ kind: "direct_send", hashes: sampleHashes });
    packed[5] = 99;
    expect(() => unpackKernelMemo(packed)).toThrow(/kind tag/);
  });
});
