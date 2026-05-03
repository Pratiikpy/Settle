#!/usr/bin/env tsx
/**
 * Verifies no real-life secrets leaked into the codebase.
 */
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

const PATTERNS = [
  /sk_live_[A-Za-z0-9]{20,}/,                 // Stripe live secret
  /sk_test_[A-Za-z0-9]{20,}/,                 // Stripe test secret
  /AKIA[0-9A-Z]{16}/,                          // AWS access key
  /AIza[0-9A-Za-z_-]{35}/,                     // Google API key
  /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/,
  /xoxb-[0-9]{11}-[0-9]{11}-[A-Za-z0-9]{24}/, // Slack bot token
  /eyJhbGciOiJ[A-Za-z0-9._-]{50,}/,            // long JWT (refresh token)
  /supabase\.co.*service_role.*ey[A-Za-z0-9._-]{50,}/i,
];

const SKIP = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "target",
  "logs",
  "coverage",
  ".test-",            // local test wallet keypairs
  ".env",              // env files (should be in gitignore)
];

interface Finding {
  file: string;
  pattern: string;
  preview: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir)) {
    if (SKIP.some((s) => ent.startsWith(s) || ent === s)) continue;
    const p = join(dir, ent);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, out);
    else if (s.size < 2_000_000) out.push(p);
  }
  return out;
}

async function main() {
  const files = walk(".");
  console.log(`# scanning ${files.length} files for secret patterns…`);
  const findings: Finding[] = [];
  for (const f of files) {
    let txt;
    try { txt = readFileSync(f, "utf8"); } catch { continue; }
    for (const p of PATTERNS) {
      const m = txt.match(p);
      if (m) findings.push({ file: f, pattern: p.source, preview: m[0].slice(0, 60) });
    }
  }
  console.log(`\n# ${findings.length} findings:`);
  for (const f of findings.slice(0, 20)) {
    console.log(`  ${f.file} → ${f.pattern} → ${f.preview}…`);
  }
  if (findings.length > 0) {
    console.log("\n✗ secrets found — review above");
    process.exit(1);
  }
  console.log("\n✓ no secrets leaked");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
