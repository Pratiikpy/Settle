import { describe, expect, it } from "vitest";
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
import { verifyReceipt } from "./verify-receipt.js";

const PURPOSE_TEXT = "Translate this 4-page paper to Japanese.";

const receipt: CanonicalReceipt = {
  request_id: "12345678-1234-4abc-9def-123456789abc",
  card_pubkey: "Card1111111111111111111111111111111111111a",
  pact_pubkey: null,
  merchant_pubkey: "Merch1111111111111111111111111111111111111",
  amount_lamports: "500000",
  capability_hash: "a".repeat(64),
  purpose_text_hash: bytesToHex(purposeTextHash(PURPOSE_TEXT)),
  decision_slot: 12345,
  policy_version: 1,
};

const reason: CanonicalReason = {
  decision: "ALLOW",
  deny_code: 0,
  cap_remaining_after: "499500",
  per_call_max: "100000",
  allowlist_match: true,
  capability_pinned: true,
  merchant_verified: true,
  expiry_slot: 99999999,
  current_slot: 12345,
};

const policy_snapshot: CanonicalPolicySnapshot = {
  policy_version: 1,
  daily_cap: "1000000",
  per_call_max: "100000",
  allowlist_count: 3,
  expiry_slot: 99999999,
  revoked: false,
};

const http: { method: PurposeHashInput["method"]; path: string } = {
  method: "POST",
  path: "/api/translate",
};

function buildExpected() {
  const receipt_hash = bytesToHex(canonicalReceiptHash(receipt));
  const reason_hash = bytesToHex(canonicalReasonHash(reason));
  const policy_snapshot_hash = bytesToHex(canonicalPolicySnapshotHash(policy_snapshot));
  const binding: PurposeHashInput = {
    request_id: receipt.request_id,
    agent_card_pubkey: receipt.card_pubkey,
    pact_pubkey: receipt.pact_pubkey,
    merchant_pubkey: receipt.merchant_pubkey,
    capability_hash: receipt.capability_hash,
    method: http.method,
    path: http.path,
    amount_lamports: receipt.amount_lamports,
    receipt_hash,
    reason_hash,
    policy_snapshot_hash,
  };
  const purpose_hash = bytesToHex(canonicalPurposeHash(binding));
  return { receipt_hash, reason_hash, policy_snapshot_hash, purpose_hash };
}

describe("verifyReceipt", () => {
  it("happy path: ok=true when nothing tampered", () => {
    const expected = buildExpected();
    const r = verifyReceipt({ receipt, reason, policy_snapshot, http, expected });
    expect(r.ok).toBe(true);
  });

  it("plaintext_purpose verifies purpose_text_hash too", () => {
    const expected = buildExpected();
    const r = verifyReceipt({
      receipt,
      reason,
      policy_snapshot,
      http,
      expected,
      plaintext_purpose: PURPOSE_TEXT,
    });
    expect(r.ok).toBe(true);
  });

  it("flags purpose_text_hash mismatch when plaintext is wrong", () => {
    const expected = buildExpected();
    const r = verifyReceipt({
      receipt,
      reason,
      policy_snapshot,
      http,
      expected,
      plaintext_purpose: "different text",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mismatches).toContain("purpose_text_hash");
  });

  it("flags receipt_hash mismatch when receipt is tampered", () => {
    const expected = buildExpected();
    const r = verifyReceipt({
      receipt: { ...receipt, amount_lamports: "999999" },
      reason,
      policy_snapshot,
      http,
      expected,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // amount tamper changes receipt_hash AND binding purpose_hash
      expect(r.mismatches).toContain("receipt_hash");
      expect(r.mismatches).toContain("purpose_hash");
    }
  });

  it("flags reason_hash mismatch when reason is tampered", () => {
    const expected = buildExpected();
    const r = verifyReceipt({
      receipt,
      reason: { ...reason, deny_code: 5 },
      policy_snapshot,
      http,
      expected,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mismatches).toContain("reason_hash");
  });

  it("flags policy_snapshot_hash mismatch when snapshot is tampered", () => {
    const expected = buildExpected();
    const r = verifyReceipt({
      receipt,
      reason,
      policy_snapshot: { ...policy_snapshot, revoked: true },
      http,
      expected,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mismatches).toContain("policy_snapshot_hash");
  });

  it("flags purpose_hash mismatch when HTTP context is tampered", () => {
    const expected = buildExpected();
    const r = verifyReceipt({
      receipt,
      reason,
      policy_snapshot,
      http: { method: "POST", path: "/api/different" },
      expected,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mismatches).toContain("purpose_hash");
  });
});
