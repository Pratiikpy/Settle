#!/usr/bin/env tsx
/**
 * Orchestrator — runs every infra script + Playwright with two-track
 * parallelism:
 *
 *   TRACK A — parallel-safe (read-only / offline / isolated): steps run
 *             via Promise.all in one batch
 *   TRACK B — sequential (touches shared state — Supabase rows, dev
 *             server, on-chain state, Playwright): steps in series
 *
 * Run: pnpm tsx scripts/test-full-suite.ts
 */
import { execSync } from "child_process";

interface Step {
  name: string;
  cmd: string;
  parallelSafe: boolean;
}

const STEPS: Step[] = [
  // ── TRACK A: parallel-safe (read-only / offline / isolated state) ──
  { name: "tsc --noEmit (apps/web)", cmd: "cd apps/web && pnpm exec tsc --noEmit", parallelSafe: true },
  { name: "lint (next lint)", cmd: "cd apps/web && pnpm exec next lint", parallelSafe: true },
  { name: "ts unit tests (sdk)", cmd: "pnpm --filter @settle/sdk test", parallelSafe: true },
  { name: "mcp middleware unit tests", cmd: "pnpm --filter @settle/mcp-middleware test", parallelSafe: true },
  { name: "smoke: idl-drift", cmd: "pnpm tsx scripts/check-idl-drift.ts", parallelSafe: true },
  { name: "smoke: ix-data-parity", cmd: "pnpm tsx scripts/smoke-ix-data-parity.ts", parallelSafe: true },
  { name: "smoke: multikind-goldens", cmd: "pnpm tsx scripts/smoke-multikind-goldens.ts", parallelSafe: true },
  { name: "smoke: indexer event audit", cmd: "pnpm tsx scripts/audit-indexer-handlers.ts", parallelSafe: true },
  { name: "kernel parity (TS == Python)", cmd: "pnpm tsx scripts/kernel-parity-cross-lang.ts", parallelSafe: true },
  { name: "anchor ix coverage (IDL)", cmd: "pnpm tsx scripts/anchor-ix-coverage.ts", parallelSafe: true },
  { name: "leak check (no secrets)", cmd: "pnpm tsx scripts/test-leak-check.ts", parallelSafe: true },
  { name: "mcp coverage (exports)", cmd: "pnpm tsx scripts/mcp-coverage.ts", parallelSafe: true },
  { name: "sdk integration (live deterministic)", cmd: "pnpm tsx scripts/sdk-integration-live.ts", parallelSafe: true },
  { name: "solana primitives", cmd: "pnpm tsx scripts/solana-primitives-coverage.ts", parallelSafe: true },

  // ── TRACK B: sequential (mutates state OR shares dev server / RPC) ──
  { name: "smoke: verify-build", cmd: "pnpm tsx scripts/smoke-verify-build.ts", parallelSafe: false },
  { name: "verify-migrations", cmd: "pnpm tsx scripts/verify-migrations.ts", parallelSafe: false },
  { name: "onchain state verify", cmd: "pnpm tsx scripts/onchain-state-verify.ts", parallelSafe: false },
  { name: "api coverage", cmd: "pnpm tsx scripts/api-coverage.ts", parallelSafe: false },
  { name: "api shape validate (12 endpoints)", cmd: "pnpm tsx scripts/api-shape-validate.ts", parallelSafe: false },
  { name: "cron fire-all", cmd: "pnpm tsx scripts/cron-fire-all.ts", parallelSafe: false },
  { name: "blink coverage", cmd: "pnpm tsx scripts/blink-coverage.ts", parallelSafe: false },
  { name: "pay-qr coverage", cmd: "pnpm tsx scripts/pay-qr-coverage.ts", parallelSafe: false },
  { name: "federation coverage", cmd: "pnpm tsx scripts/federation-coverage.ts", parallelSafe: false },
  { name: "mcp subprocess JSON-RPC", cmd: "pnpm tsx scripts/mcp-subprocess-test.ts", parallelSafe: false },
  { name: "security audit", cmd: "pnpm tsx scripts/security-audit.ts", parallelSafe: false },
  // The Playwright command must use `set` for env-var-then-cmd under cmd.exe,
  // or `&&` chaining works under POSIX. We pass the env var via the shell.
  { name: "Playwright E2E (workers=4)", cmd: process.platform === "win32"
    ? "cd apps/web && set PLAYWRIGHT_WORKERS=4 && pnpm exec playwright test --reporter=line"
    : "cd apps/web && PLAYWRIGHT_WORKERS=4 pnpm exec playwright test --reporter=line",
    parallelSafe: false },
];

interface RunResult {
  name: string;
  ok: boolean;
  ms: number;
}

function runOne(step: Step): RunResult {
  const start = Date.now();
  try {
    execSync(step.cmd, {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 900_000,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
    } as never);
    return { name: step.name, ok: true, ms: Date.now() - start };
  } catch {
    return { name: step.name, ok: false, ms: Date.now() - start };
  }
}

async function main() {
  const parallel = STEPS.filter((s) => s.parallelSafe);
  const sequential = STEPS.filter((s) => !s.parallelSafe);
  console.log(
    `# test-full-suite — ${STEPS.length} steps (${parallel.length} parallel + ${sequential.length} sequential)`,
  );

  const results: RunResult[] = [];

  console.log(`\n── Track A: ${parallel.length} parallel-safe steps ──`);
  const tA0 = Date.now();
  const parallelResults = await Promise.all(
    parallel.map((s) => Promise.resolve().then(() => runOne(s))),
  );
  for (const r of parallelResults) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(45)} ${r.ms}ms`);
    results.push(r);
  }
  console.log(`Track A wall-clock: ${Date.now() - tA0}ms`);

  console.log(`\n── Track B: ${sequential.length} sequential steps ──`);
  const tB0 = Date.now();
  for (const step of sequential) {
    const r = runOne(step);
    console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(45)} ${r.ms}ms`);
    results.push(r);
  }
  console.log(`Track B wall-clock: ${Date.now() - tB0}ms`);

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(`\n# Total: ${ok}/${STEPS.length} ok, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
