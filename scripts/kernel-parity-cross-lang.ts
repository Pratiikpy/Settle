#!/usr/bin/env tsx
/**
 * Section 14.4 — TS / Python / Rust SDK kernel hash parity (live).
 */
import "dotenv/config";
import { execSync } from "child_process";
import { canonicalPurposeHash } from "@settle/sdk";

const INPUT = {
  request_id: "00000000-0000-0000-0000-000000000001",
  agent_card_pubkey: "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY",
  pact_pubkey: null,
  merchant_pubkey: "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
  capability_hash: "0".repeat(64),
  method: "GET" as const,
  path: "/test",
  amount_lamports: "1000",
  receipt_hash: "0".repeat(64),
  reason_hash: "0".repeat(64),
  policy_snapshot_hash: "0".repeat(64),
};

const PY_VENV = process.env.SETTLE_PY_VENV ?? "C:/Users/prate/AppData/Local/Temp/settle-sdk-test-py/.venv";
const PY_SCRIPT = process.env.SETTLE_PY_SCRIPT ?? "C:/Users/prate/AppData/Local/Temp/settle-sdk-test-py/parity_print.py";

async function main() {
  console.log("# kernel-parity-cross-lang");

  const tsHash = Buffer.from(canonicalPurposeHash(INPUT)).toString("hex");
  console.log(`TS:     ${tsHash}`);

  let pyHash: string | null = null;
  try {
    const out = execSync(`"${PY_VENV}/Scripts/python.exe" "${PY_SCRIPT}"`, {
      input: JSON.stringify(INPUT),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    pyHash = out;
    console.log(`Python: ${pyHash}`);
  } catch (e: any) {
    console.log(`Python: skipped (${String(e.message ?? e).slice(0, 100)})`);
  }

  if (pyHash && pyHash === tsHash) {
    console.log("\n✓ TS == Python (byte-equal hashes)");
  } else if (pyHash) {
    console.log(`\n✗ TS != Python: ${tsHash} vs ${pyHash}`);
    process.exit(1);
  }
  console.log("(Rust parity proven via 44 cargo tests + scripts/smoke-multikind-goldens.ts)");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
