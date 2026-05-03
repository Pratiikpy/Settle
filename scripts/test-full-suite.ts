#!/usr/bin/env tsx
/**
 * Orchestrator — runs every infra script + Playwright in sequence and
 * reports a single ✓/✗ per check.
 *
 * Run: pnpm tsx scripts/test-full-suite.ts
 */
import { execSync } from "child_process";

interface Step {
  name: string;
  cmd: string;
  required: boolean;
}

const STEPS: Step[] = [
  { name: "tsc --noEmit (apps/web)", cmd: "cd apps/web && pnpm exec tsc --noEmit", required: true },
  { name: "lint (next lint)", cmd: "cd apps/web && pnpm exec next lint", required: true },
  { name: "ts unit tests (sdk)", cmd: "pnpm --filter @settle/sdk test", required: true },
  { name: "mcp middleware unit tests", cmd: "pnpm --filter @settle/mcp-middleware test", required: true },
  { name: "smoke: idl-drift", cmd: "pnpm tsx scripts/check-idl-drift.ts", required: true },
  { name: "smoke: ix-data-parity", cmd: "pnpm tsx scripts/smoke-ix-data-parity.ts", required: true },
  { name: "smoke: multikind-goldens", cmd: "pnpm tsx scripts/smoke-multikind-goldens.ts", required: true },
  { name: "smoke: verify-build", cmd: "pnpm tsx scripts/smoke-verify-build.ts", required: true },
  { name: "smoke: indexer event audit", cmd: "pnpm tsx scripts/audit-indexer-handlers.ts", required: true },
  { name: "verify-migrations", cmd: "pnpm tsx scripts/verify-migrations.ts", required: true },
  { name: "kernel parity (TS == Python)", cmd: "pnpm tsx scripts/kernel-parity-cross-lang.ts", required: true },
  { name: "anchor ix coverage (IDL)", cmd: "pnpm tsx scripts/anchor-ix-coverage.ts", required: true },
  { name: "api coverage", cmd: "pnpm tsx scripts/api-coverage.ts", required: true },
  { name: "cron fire-all", cmd: "pnpm tsx scripts/cron-fire-all.ts", required: true },
  { name: "blink coverage", cmd: "pnpm tsx scripts/blink-coverage.ts", required: true },
  { name: "pay-qr coverage", cmd: "pnpm tsx scripts/pay-qr-coverage.ts", required: true },
  { name: "federation coverage", cmd: "pnpm tsx scripts/federation-coverage.ts", required: true },
  { name: "mcp coverage", cmd: "pnpm tsx scripts/mcp-coverage.ts", required: true },
  { name: "sdk integration (live deterministic)", cmd: "pnpm tsx scripts/sdk-integration-live.ts", required: true },
  { name: "solana primitives", cmd: "pnpm tsx scripts/solana-primitives-coverage.ts", required: true },
  { name: "onchain state verify", cmd: "pnpm tsx scripts/onchain-state-verify.ts", required: true },
  { name: "api shape validate (12 endpoints)", cmd: "pnpm tsx scripts/api-shape-validate.ts", required: true },
  { name: "leak check (no secrets)", cmd: "pnpm tsx scripts/test-leak-check.ts", required: true },
  { name: "security audit", cmd: "pnpm tsx scripts/security-audit.ts", required: true },
  { name: "Playwright E2E (full)", cmd: "cd apps/web && pnpm exec playwright test --reporter=line", required: true },
];

async function main() {
  console.log(`# test-full-suite — ${STEPS.length} steps`);
  const results: Array<[string, "ok" | "fail", number]> = [];
  for (const step of STEPS) {
    const start = Date.now();
    try {
      execSync(step.cmd, { stdio: ["ignore", "ignore", "ignore"], timeout: 600_000, shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash" } as any);
      const ms = Date.now() - start;
      console.log(`✓ ${step.name.padEnd(40)} ${ms}ms`);
      results.push([step.name, "ok", ms]);
    } catch (e: any) {
      const ms = Date.now() - start;
      console.log(`✗ ${step.name.padEnd(40)} ${ms}ms`);
      results.push([step.name, "fail", ms]);
    }
  }
  const ok = results.filter(([, s]) => s === "ok").length;
  const fail = results.filter(([, s]) => s === "fail").length;
  console.log(`\n# Total: ${ok}/${STEPS.length} ok, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
