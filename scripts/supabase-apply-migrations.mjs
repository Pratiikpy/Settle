#!/usr/bin/env node
/**
 * supabase-apply-migrations — applies infra/supabase/migrations/000N_*.sql files
 * in order to a Supabase project via the Management API SQL endpoint.
 *
 * Auth: SUPABASE_ACCESS_TOKEN (a Personal Access Token, sbp_...).
 * Project ref: passed as positional argv[2] OR SUPABASE_PROJECT_REF env.
 *
 * Why this helper exists instead of `supabase db push`: the standard `db push`
 * needs the database password set via dashboard. The Management API SQL
 * endpoint authenticates with the Personal Access Token alone, which we
 * already have for the CLI. Faster bring-up + one auth surface.
 *
 * Idempotent migrations (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)
 * mean re-running is safe. Migrations that aren't idempotent will throw on
 * the second run; we'll surface the error and you can decide whether to
 * patch the migration or skip via FROM env.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PAT = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.argv[2] ?? process.env.SUPABASE_PROJECT_REF;
const FROM = Number(process.env.FROM ?? 1);
const DRY_RUN = process.env.DRY_RUN === "1";

if (!PAT || !REF) {
  console.error("Usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/supabase-apply-migrations.mjs <project-ref>");
  process.exit(1);
}

const MIG_DIR = "infra/supabase/migrations";
const files = readdirSync(MIG_DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

console.log(`📦 ${files.length} migration files found, starting from #${FROM}`);
if (DRY_RUN) console.log("🌵 DRY RUN — will print SQL but not execute\n");

const endpoint = `https://api.supabase.com/v1/projects/${REF}/database/query`;

let ok = 0;
let failed = 0;
const errors = [];

for (const f of files) {
  const num = Number(f.slice(0, 4));
  if (num < FROM) continue;
  const sql = readFileSync(join(MIG_DIR, f), "utf8");
  process.stdout.write(`  ${f.padEnd(45, " ")} `);

  if (DRY_RUN) {
    console.log(`(${sql.length} chars, would POST)`);
    continue;
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok) {
      console.log("✓");
      ok++;
    } else {
      console.log(`✗ HTTP ${res.status}`);
      console.log(`     ${text.slice(0, 200)}`);
      errors.push({ file: f, status: res.status, body: text });
      failed++;
    }
  } catch (e) {
    console.log(`✗ ${e.message}`);
    errors.push({ file: f, error: String(e) });
    failed++;
  }
}

console.log();
console.log(`Summary: ${ok} applied · ${failed} failed`);
if (errors.length > 0) {
  console.log();
  console.log("First 3 errors:");
  for (const e of errors.slice(0, 3)) {
    console.log(JSON.stringify(e, null, 2));
  }
  process.exit(1);
}
