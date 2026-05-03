#!/usr/bin/env tsx
/**
 * SDK exhaustive coverage — every public method × all 3 languages.
 */
import "dotenv/config";
import { execSync as runSync } from "child_process";
import {
  canonicalPurposeHash,
  canonicalReasonHash,
  canonicalPolicySnapshotHash,
  canonicalReceiptHash,
  buildIxData,
  computeCapabilityHashHex,
} from "@settle/sdk";

const PY = "C:/Users/prate/AppData/Local/Temp/settle-sdk-test-py/.venv/Scripts/python.exe";

function pyHash(fn: string, payload: unknown): string {
  const code = `from settle_sdk import ${fn}; import json,sys; print(${fn}(json.loads(sys.stdin.read())).hex())`;
  return runSync(`"${PY}" -c "${code.replace(/"/g, '\\"')}"`, {
    input: JSON.stringify(payload),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

const ZERO = "0".repeat(64);
let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (cond) { console.log(`✓ ${label}${extra ? " — " + extra : ""}`); pass++; }
  else { console.log(`✗ ${label}${extra ? " — " + extra : ""}`); fail++; }
};

async function main() {
  console.log("# sdk-full-coverage\n");
  console.log("## canonical hashes (TS == Python byte-equal)");

  const reasonInput = {
    decision: "ALLOW", deny_code: 0,
    cap_remaining_after: "5000", per_call_max: "10000",
    allowlist_match: true, capability_pinned: false, merchant_verified: false,
    expiry_slot: 460_000_000, current_slot: 459_725_900,
  };
  const tsReason = Buffer.from(canonicalReasonHash(reasonInput)).toString("hex");
  const pyReason = pyHash("canonical_reason_hash", reasonInput);
  ok("canonical_reason_hash TS==Py", tsReason === pyReason, tsReason);

  const policyInput = {
    policy_version: 1, daily_cap: "100000000", per_call_max: "10000000",
    allowlist_count: 1, expiry_slot: 460_000_000, revoked: false,
  };
  const tsPolicy = Buffer.from(canonicalPolicySnapshotHash(policyInput)).toString("hex");
  const pyPolicy = pyHash("canonical_policy_snapshot_hash", policyInput);
  ok("canonical_policy_snapshot_hash TS==Py", tsPolicy === pyPolicy, tsPolicy);

  const purposeInput = {
    request_id: "00000000-0000-0000-0000-000000000abc",
    agent_card_pubkey: "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY",
    pact_pubkey: null,
    merchant_pubkey: "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
    capability_hash: ZERO, method: "POST", path: "/api/v1/test",
    amount_lamports: "5000",
    receipt_hash: ZERO, reason_hash: tsReason, policy_snapshot_hash: tsPolicy,
  };
  const tsPurpose = Buffer.from(canonicalPurposeHash(purposeInput)).toString("hex");
  const pyPurpose = pyHash("canonical_purpose_hash", purposeInput);
  ok("canonical_purpose_hash TS==Py", tsPurpose === pyPurpose, tsPurpose);

  const receiptInput = {
    request_id: "00000000-0000-0000-0000-000000000abc",
    card_pubkey: "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY",
    pact_pubkey: null,
    merchant_pubkey: "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
    amount_lamports: "5000",
    capability_hash: ZERO,
    purpose_text_hash: ZERO,
    decision_slot: 459725900,
    policy_version: 1,
  };
  const tsReceipt = Buffer.from(canonicalReceiptHash(receiptInput)).toString("hex");
  const pyReceipt = pyHash("canonical_receipt_hash", receiptInput);
  ok("canonical_receipt_hash TS==Py", tsReceipt === pyReceipt, tsReceipt);

  console.log("\n## capability_hash");
  const cap = { domain: "example.com", method: "GET" as const, path: "/api/v1/data", amount_lamports: "500000", version: 1 };
  const tsCap = computeCapabilityHashHex(cap);
  const pyCapStr = runSync(
    `"${PY}" -c "from settle_sdk import compute_capability_hash_hex; import json,sys; print(compute_capability_hash_hex(json.loads(sys.stdin.read())))"`,
    { input: JSON.stringify(cap), encoding: "utf8" },
  ).trim();
  ok("compute_capability_hash_hex TS==Py", tsCap === pyCapStr, `${tsCap.slice(0, 16)}…`);

  console.log("\n## buildIxData — anchor ix data byte counts");
  const closeBytes = buildIxData("close_pact", () => {});
  ok("close_pact = 8 bytes", closeBytes.length === 8);
  const revokeBytes = buildIxData("revoke", () => {});
  ok("revoke = 8 bytes", revokeBytes.length === 8);
  const pauseBytes = buildIxData("pause_streaming", () => {});
  ok("pause_streaming = 8 bytes", pauseBytes.length === 8);
  const resumeBytes = buildIxData("resume_streaming", () => {});
  ok("resume_streaming = 8 bytes", resumeBytes.length === 8);
  const releaseBytes = buildIxData("release_delivery_escrow", () => {});
  ok("release_delivery_escrow = 8 bytes", releaseBytes.length === 8);
  const disputeBytes = buildIxData("dispute_delivery_escrow", () => {});
  ok("dispute_delivery_escrow = 8 bytes", disputeBytes.length === 8);

  const spendBytes = buildIxData("spend", (w) => {
    w.u64(BigInt(1000));
    for (let i = 0; i < 4; i++) w.fixedBytes(Buffer.alloc(32), 32);
  });
  ok("spend = 144 bytes", spendBytes.length === 144);
  const spendViaPactBytes = buildIxData("spend_via_pact", (w) => {
    w.u64(BigInt(1000));
    for (let i = 0; i < 4; i++) w.fixedBytes(Buffer.alloc(32), 32);
  });
  ok("spend_via_pact = 144 bytes", spendViaPactBytes.length === 144);

  const recordReceiptBytes = buildIxData("record_receipt", (w) => {
    w.u8(0);
    for (let i = 0; i < 5; i++) w.fixedBytes(Buffer.alloc(32), 32);
  });
  ok("record_receipt = 169 bytes", recordReceiptBytes.length === 169);
  const recordDenialBytes = buildIxData("record_denial", (w) => {
    w.u8(0);
    for (let i = 0; i < 5; i++) w.fixedBytes(Buffer.alloc(32), 32);
  });
  ok("record_denial = 169 bytes", recordDenialBytes.length === 169);

  console.log("\n## Rust SDK (cargo test --release)");
  try {
    const out = runSync("cd packages/rust-sdk && cargo test --release 2>&1", {
      encoding: "utf8",
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
      maxBuffer: 10 * 1024 * 1024,
    } as never);
    // Sum all "test result: ok. N passed" lines
    let passed = 0;
    const matches = out.matchAll(/test result: ok\. (\d+) passed/g);
    for (const m of matches) passed += Number(m[1]);
    ok(`Rust ≥40 cargo tests pass (release)`, passed >= 40, `passed=${passed}`);
  } catch (e) {
    ok("Rust cargo tests", false, String(e).slice(0, 80));
  }

  console.log(`\nTotal: ${pass} pass / ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(2); });
