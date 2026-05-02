#!/usr/bin/env tsx
/**
 * F9.1 — Verifiable build hash publisher.
 *
 * Reads the compiled Anchor program (.so file) from the local target dir,
 * computes its SHA256, and writes a `build-info.json` alongside it that
 * records: hash, file size, commit SHA, build timestamp, builder host.
 *
 * The committed `build-info.json` is the "claimed hash". A verifier
 * (or our /api/verify-build endpoint) compares it against the
 * on-chain ProgramData account's SHA256 to prove "the binary running
 * on-chain is exactly what was committed at this git SHA."
 *
 * Run locally after every `cargo build-sbf` / `anchor build`, OR have CI
 * run this on every push to record the production hash.
 *
 * Usage:
 *   pnpm exec tsx scripts/compute-program-hash.ts
 *   pnpm exec tsx scripts/compute-program-hash.ts --strict   # fail if uncommitted local changes
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { hostname, platform, arch } from "node:os";
import { resolve } from "node:path";

const SO_PATH = resolve(
  process.cwd(),
  "programs/settle-agent-card/target/deploy/settle_agent_card.so",
);
const OUT_PATH = resolve(
  process.cwd(),
  "programs/settle-agent-card/target/deploy/build-info.json",
);

interface BuildInfo {
  /** hex SHA256 of the on-disk .so bytes. */
  sha256: string;
  /** Bytes — for sanity on 'this looks ridiculously small/large' checks. */
  size_bytes: number;
  /** Git commit SHA at build time. */
  commit: string;
  /** Whether the working tree was dirty. */
  dirty: boolean;
  /** ISO timestamp of when this file was written. */
  built_at: string;
  /** Builder host metadata — useful for reproducing "alice's mac vs CI ubuntu". */
  builder: {
    hostname: string;
    platform: string;
    arch: string;
  };
}

function gitSha(): { sha: string; dirty: boolean } {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim();
    return { sha, dirty: status.length > 0 };
  } catch {
    return { sha: "unknown", dirty: false };
  }
}

function sha256File(path: string): string {
  const buf = readFileSync(path);
  const h = createHash("sha256");
  h.update(buf);
  return h.digest("hex");
}

function main() {
  const strict = process.argv.includes("--strict");
  if (!existsSync(SO_PATH)) {
    console.error(
      `[verifiable-build] No .so at ${SO_PATH}. Run \`cargo build-sbf --manifest-path programs/settle-agent-card/Cargo.toml --tools-version v1.54\` first.`,
    );
    process.exit(1);
  }

  const stat = statSync(SO_PATH);
  const sha = sha256File(SO_PATH);
  const git = gitSha();
  if (strict && git.dirty) {
    console.error(
      "[verifiable-build] --strict: working tree has uncommitted changes. Refusing to publish a hash that nobody else can reproduce.",
    );
    process.exit(2);
  }

  const info: BuildInfo = {
    sha256: sha,
    size_bytes: stat.size,
    commit: git.sha,
    dirty: git.dirty,
    built_at: new Date().toISOString(),
    builder: {
      hostname: hostname(),
      platform: platform(),
      arch: arch(),
    },
  };

  writeFileSync(OUT_PATH, JSON.stringify(info, null, 2) + "\n");
  console.log(`✓ wrote ${OUT_PATH}`);
  console.log(`  sha256:  ${info.sha256}`);
  console.log(`  size:    ${info.size_bytes} bytes`);
  console.log(`  commit:  ${info.commit}${info.dirty ? " (dirty)" : ""}`);
  console.log(`  built:   ${info.built_at}`);
}

main();
