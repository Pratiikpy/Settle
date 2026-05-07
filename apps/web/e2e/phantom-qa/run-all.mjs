#!/usr/bin/env node
/**
 * Master orchestrator — runs every non-on-chain driver in sequence and
 * emits a single pass/fail summary. The on-chain drivers (real-onchain-send,
 * real-spend-via-pact, real-deny-and-revoke, real-pact-lifecycle,
 * real-streaming-pact) cost SOL + USDC each run, so they're excluded by
 * default; their results are already committed evidence in this repo.
 *
 * Run:
 *   cd apps/web && node e2e/phantom-qa/run-all.mjs
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const DRIVERS = [
  // Fast — pure programmatic, no on-chain
  { file: "split-bill-multiwallet.mjs",   runner: "node", needsAuth: true,  desc: "2-wallet split-bill flow" },
  { file: "group-3wallet.mjs",             runner: "node", needsAuth: true,  desc: "3-wallet group create + propose-spend" },
  { file: "handle-claim-webhook.mjs",      runner: "node", needsAuth: true,  desc: "Handle claim + webhook auth chain" },
  { file: "verify-bug-53.mjs",             runner: "node", needsAuth: true,  desc: "Bug #53 3-case auth verifier" },
  { file: "sdk-ts-e2e.mjs",                runner: "tsx",  needsAuth: false, desc: "@settle/sdk 8 cases + live API roundtrip" },
  { file: "full-feature-driver.mjs",       runner: "node", needsAuth: true,  desc: "Full-feature driver (11 endpoints, 1 sigs each)" },
  { file: "real-import-receipt.mjs",       runner: "node", needsAuth: true,  desc: "Import a real on-chain SPL tx into Settle receipts" },
  { file: "real-group-voting.mjs",         runner: "node", needsAuth: true,  desc: "3-wallet group voting end-to-end + 2 negative tests" },
  { file: "mcp-middleware-e2e.mjs",        runner: "tsx",  needsAuth: false, desc: "@settle/mcp-middleware 8 cases" },
  { file: "webhook-hmac-verify.mjs",       runner: "tsx",  needsAuth: false, desc: "Webhook HMAC sign+verify 8 cases" },
];

const results = [];

function run(file, runner) {
  return new Promise((resolveProm) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "npx.cmd" : "npx";
    const args = runner === "tsx" ? ["tsx", file] : [];
    const target = runner === "tsx"
      ? spawn(cmd, ["tsx", resolve(HERE, file)], { cwd: resolve(HERE, "../.."), shell: true })
      : spawn(process.execPath, [resolve(HERE, file)], { cwd: resolve(HERE, "../..") });
    let stdout = "", stderr = "";
    target.stdout.on("data", (d) => { stdout += d.toString(); });
    target.stderr.on("data", (d) => { stderr += d.toString(); });
    target.on("close", (code) => resolveProm({ code, stdout, stderr }));
  });
}

const start = Date.now();
console.log(`Running ${DRIVERS.length} drivers against production…\n`);

for (const drv of DRIVERS) {
  process.stdout.write(`▶ ${drv.file.padEnd(36)} `);
  const t0 = Date.now();
  const r = await run(drv.file, drv.runner);
  const dur = ((Date.now() - t0) / 1000).toFixed(1);

  // Extract pass/fail count from stdout — most drivers print "X/Y passed"
  const match = r.stdout.match(/(\d+)\s*\/\s*(\d+)\s+passed/);
  const passLine = r.stdout.match(/^PASS .*$/m) || r.stdout.includes("PASS");
  let summary;
  if (match) {
    summary = `${match[1]}/${match[2]} (${dur}s)`;
  } else if (r.code === 0 && passLine) {
    summary = `PASS (${dur}s)`;
  } else {
    summary = `${r.code === 0 ? "PASS" : "FAIL"} (${dur}s)`;
  }
  const status = r.code === 0 ? "✓" : "✗";
  console.log(`${status}  ${summary}`);
  results.push({ ...drv, code: r.code, summary, dur });
}

const totalSec = ((Date.now() - start) / 1000).toFixed(1);
const passed = results.filter((r) => r.code === 0).length;

console.log("\n" + "─".repeat(60));
console.log(`${passed}/${results.length} drivers PASSED in ${totalSec}s`);
console.log("─".repeat(60));

if (passed < results.length) {
  console.log("\nFailed drivers:");
  results.filter((r) => r.code !== 0).forEach((r) => {
    console.log(`  ✗ ${r.file} — ${r.desc}`);
  });
  process.exit(1);
}

console.log("\nOn-chain drivers (excluded — already-committed evidence):");
console.log("  • real-onchain-send.mjs       — sig 2s71RsGr…");
console.log("  • real-spend-via-pact.mjs     — sig 4ZzgMFwQ… (Bug #26 runtime proof)");
console.log("  • real-deny-and-revoke.mjs    — 3/3 (PerCallMaxExceeded + CardRevoked)");
console.log("  • real-pact-lifecycle.mjs     — open→spend→close, vault drained");
console.log("  • real-streaming-pact.mjs     — claim_streaming sig 3cVPDeox…");
console.log("");
process.exit(0);
