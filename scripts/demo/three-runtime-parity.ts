#!/usr/bin/env tsx
/**
 * Three-runtime hash parity demo.
 *
 * Runs the Settle receipt kernel in TypeScript, Python, and Rust against
 * the same canonical input and prints all four BLAKE3 hashes side-by-side.
 *
 * Output is laid out as a 4-column terminal table where the right answer
 * is "every column has identical values for every row." This is the proof
 * that drives the "byte-identical hashes across three SDKs" claim.
 *
 * Usage:
 *   pnpm tsx scripts/demo/three-runtime-parity.ts
 *
 * Use this as the wow-moment artifact in the demo video, pitch deck,
 * README, and Twitter announcement.
 */
import { spawnSync } from "child_process";
import { resolve } from "path";

const REPO = resolve(__dirname, "..", "..");

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function header(s: string) {
  const line = "═".repeat(72);
  console.log(`\n${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}${s}${C.reset}`);
  console.log(`${C.cyan}${line}${C.reset}\n`);
}

function step(s: string) {
  console.log(`${C.dim}> ${s}${C.reset}`);
}

interface Hashes {
  receipt_hash: string;
  reason_hash: string;
  policy_snapshot_hash: string;
  purpose_hash: string;
  context_hash: string;
}

function parseHashesFromText(text: string): Partial<Hashes> {
  const out: Partial<Hashes> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(
      /^\s*(?:\[OK\]\s+)?(receipt_hash|reason_hash|policy_snapshot_hash|purpose_hash|context_hash)\s*[:= ]+\s*([0-9a-f]{64})/i,
    );
    if (m) {
      const key = m[1] as keyof Hashes;
      if (!out[key]) out[key] = m[2];
    }
  }
  return out;
}

// All arguments here are hardcoded constants from this script; no user input
// flows into the command line. shell:true is needed on Windows so .cmd shims
// (pnpm.cmd, cargo.cmd) resolve correctly.
function runArgv(label: string, command: string, argv: string[], cwd: string): string {
  const result = spawnSync(command, argv, {
    cwd,
    encoding: "utf8",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `${label} exited with code ${result.status}\n  stderr: ${result.stderr}\n  stdout: ${result.stdout}`,
    );
  }
  return result.stdout;
}

function runTs(): Hashes {
  step("running TypeScript (packages/sdk via tsx)...");
  const stdout = runArgv(
    "TypeScript",
    "pnpm",
    ["tsx", resolve(REPO, "scripts", "smoke-multikind-goldens.ts")],
    REPO,
  );
  const blocks = stdout.split(/^─+$/m);
  const directBlock = blocks.find((b) => b.includes("direct_send"));
  if (!directBlock) throw new Error("could not find direct_send block in TS output");
  return assertComplete("TypeScript", parseHashesFromText(directBlock));
}

function runPython(): Hashes {
  step("running Python (settle-protocol-sdk via test_kernel_parity)...");
  const stdout = runArgv(
    "Python",
    "python",
    ["test_kernel_parity.py"],
    resolve(REPO, "packages", "python-sdk"),
  );
  return assertComplete("Python", parseHashesFromText(stdout));
}

function runRust(): Hashes {
  step("running Rust (settle-sdk crate via cargo run --example parity_smoke)...");
  const stdout = runArgv(
    "Rust",
    "cargo",
    ["run", "--quiet", "--example", "parity_smoke"],
    resolve(REPO, "packages", "rust-sdk"),
  );
  return assertComplete("Rust", parseHashesFromText(stdout));
}

function assertComplete(name: string, p: Partial<Hashes>): Hashes {
  const need: (keyof Hashes)[] = [
    "receipt_hash",
    "reason_hash",
    "policy_snapshot_hash",
    "purpose_hash",
    "context_hash",
  ];
  for (const k of need) {
    if (!p[k]) {
      throw new Error(
        `${name}: missing ${k}\n  parsed so far: ${JSON.stringify(p, null, 2)}`,
      );
    }
  }
  return p as Hashes;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

function compareTable(ts: Hashes, py: Hashes, rs: Hashes): boolean {
  const keys: (keyof Hashes)[] = [
    "receipt_hash",
    "reason_hash",
    "policy_snapshot_hash",
    "purpose_hash",
    "context_hash",
  ];

  console.log();
  console.log(
    `${C.bold}${pad("hash", 22)}${pad("TypeScript", 18)}${pad(
      "Python",
      18,
    )}${pad("Rust", 18)}match${C.reset}`,
  );
  console.log(
    `${C.dim}${"─".repeat(22)}${"─".repeat(18)}${"─".repeat(18)}${"─".repeat(
      18,
    )}─────${C.reset}`,
  );

  let allMatch = true;
  for (const k of keys) {
    const t = ts[k];
    const p = py[k];
    const r = rs[k];
    const ok = t === p && p === r;
    if (!ok) allMatch = false;
    const icon = ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    console.log(
      `${pad(k, 22)}${C.dim}${pad(t.slice(0, 12) + "…", 18)}${pad(
        p.slice(0, 12) + "…",
        18,
      )}${pad(r.slice(0, 12) + "…", 18)}${C.reset}  ${icon}`,
    );
  }
  console.log();
  return allMatch;
}

function main() {
  header("Settle · three-runtime BLAKE3 parity demo");

  console.log(`${C.dim}Same canonical input. Three runtimes. Compare.${C.reset}`);
  console.log(`${C.dim}Locked input: kind=direct_send, amount=500000 lamports,${C.reset}`);
  console.log(
    `${C.dim}sender=B4cArR…to2Cp, recipient=C9HAss…s7yY, slot=1000, purpose="coffee with alice"${C.reset}`,
  );

  const ts = runTs();
  const py = runPython();
  const rs = runRust();

  const ok = compareTable(ts, py, rs);

  if (ok) {
    console.log(
      `${C.green}${C.bold}✓ All 5 hashes match across TypeScript, Python, and Rust.${C.reset}`,
    );
    console.log(
      `${C.dim}This is the proof behind the "byte-identical SDK parity" claim.${C.reset}`,
    );
    console.log();
    console.log(`${C.dim}Full hashes:${C.reset}`);
    console.log(`  receipt_hash         = ${ts.receipt_hash}`);
    console.log(`  reason_hash          = ${ts.reason_hash}`);
    console.log(`  policy_snapshot_hash = ${ts.policy_snapshot_hash}`);
    console.log(`  purpose_hash         = ${ts.purpose_hash}`);
    console.log(`  context_hash         = ${ts.context_hash}`);
    console.log();
    process.exit(0);
  } else {
    console.log(
      `${C.red}${C.bold}✗ Hashes diverge. The SDK parity claim is broken.${C.reset}`,
    );
    process.exit(1);
  }
}

main();
