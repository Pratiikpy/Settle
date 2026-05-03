#!/usr/bin/env tsx
/**
 * Section 14.4 — SDK integration: real schemas, real hashes, deterministic.
 */
import "dotenv/config";
import {
  canonicalPurposeHash,
  canonicalReasonHash,
  canonicalPolicySnapshotHash,
} from "@settle/sdk";

const ZERO = "0".repeat(64);

async function main() {
  console.log("# sdk-integration-live");

  const reason = canonicalReasonHash({
    decision: "ALLOW",
    deny_code: 0,
    cap_remaining_after: "5000",
    per_call_max: "10000",
    allowlist_match: true,
    capability_pinned: false,
    merchant_verified: false,
    expiry_slot: 460_000_000,
    current_slot: 459_725_900,
  });
  const reasonHex = Buffer.from(reason).toString("hex");
  console.log(`reason_hash:           ${reasonHex}`);

  const policy = canonicalPolicySnapshotHash({
    policy_version: 1,
    daily_cap: "100000000",
    per_call_max: "10000000",
    allowlist_count: 1,
    expiry_slot: 460_000_000,
    revoked: false,
  });
  const policyHex = Buffer.from(policy).toString("hex");
  console.log(`policy_snapshot_hash:  ${policyHex}`);

  const purposeInput = {
    request_id: "00000000-0000-0000-0000-deadbeefcafe",
    agent_card_pubkey: "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY",
    pact_pubkey: null,
    merchant_pubkey: "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
    capability_hash: ZERO,
    method: "POST" as const,
    path: "/api/v1/test",
    amount_lamports: "5000",
    receipt_hash: ZERO,
    reason_hash: reasonHex,
    policy_snapshot_hash: policyHex,
  };

  const a = Buffer.from(canonicalPurposeHash(purposeInput)).toString("hex");
  const b = Buffer.from(canonicalPurposeHash(purposeInput)).toString("hex");
  console.log(`purpose_hash:          ${a}`);

  if (a !== b) {
    console.log("✗ NON-DETERMINISTIC");
    process.exit(1);
  }
  console.log(`✓ deterministic across calls`);
  console.log("\n✓ sdk-integration-live PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
