#!/usr/bin/env tsx
/**
 * Computes the same kernel commit input as the Python parity test so we
 * can byte-compare hash outputs across implementations. Run alongside:
 *   cd packages/python-sdk && python test_parity.py
 */
import { kernelCommit, computeCapabilityHashHex } from "../packages/sdk/dist/index.js";

const result = kernelCommit({
  kind: "direct_send",
  request_id: "11111111-2222-3333-4444-555555555555",
  amount_lamports: "500000",
  sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp",
  recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY",
  decision_slot: 1000,
  purpose_text: "coffee with alice",
});

console.log("kind:                ", result.kind);
console.log("receipt_hash:        ", result.hashes.receipt_hash);
console.log("reason_hash:         ", result.hashes.reason_hash);
console.log("policy_snapshot_hash:", result.hashes.policy_snapshot_hash);
console.log("purpose_hash:        ", result.hashes.purpose_hash);
console.log("context_hash:        ", result.context_hash);

const cap = computeCapabilityHashHex({
  domain: "translate.demo.settle",
  method: "POST",
  path: "/v1/translate",
  amount_lamports: "20000",
  version: 1,
});
console.log("\nTranslate cap hash: ", cap);
