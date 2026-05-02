#!/usr/bin/env tsx
/**
 * AU-10-001 verification — for each table flagged as RLS-disabled in
 * FINDINGS.md, hit it with the anon JWT and classify:
 *   - LEAK   : anon SELECT returns ≥1 row (real exposure)
 *   - BLOCK  : 401 / 403 / RLS error (defended by grants OR RLS)
 *   - EMPTY  : 200 with [] (table empty, indeterminate)
 *   - SKIP   : table doesn't exist (false positive in finding)
 *
 * Reads the anon URL + key from apps/web/.env.local. Outputs a markdown
 * table to stdout that can be appended to FINDINGS.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface EnvFile {
  [key: string]: string;
}

function loadEnv(path: string): EnvFile {
  const raw = readFileSync(path, "utf8");
  const out: EnvFile = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    out[m[1]!] = m[2]!.replace(/^"|"$/g, "");
  }
  return out;
}

const TABLES = [
  "agent_trust_scores",
  "allowances",
  "auto_refill_queue",
  "auto_refill_rules",
  "capability_registry",
  "domain_verification_tokens",
  "federated_receipts",
  "federation_origins",
  "fraud_flags",
  "gift_sends",
  "group_account_members",
  "group_accounts",
  "group_spend_approvals",
  "group_spend_requests",
  "idempotency_keys",
  "kernel_receipt_attestations",
  "nonce_cache",
  "phase5_executions",
  "receipt_tags",
  "round_up_queue",
  // Plus ~4 likely more — discovered by checking common Settle tables
  "audit_log",
  "compliance_exports",
  "follows",
  "handles",
  "intents",
  "split_bills",
  "streaming_pacts",
  "wishes",
];

interface Row {
  table: string;
  status: "LEAK" | "BLOCK" | "EMPTY" | "SKIP" | "ERROR";
  detail: string;
  rowsReturned?: number;
}

async function probe(
  url: string,
  anon: string,
  table: string,
): Promise<Row> {
  const target = `${url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(
    table,
  )}?select=*&limit=1`;
  let res: Response;
  try {
    res = await fetch(target, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    return { table, status: "ERROR", detail: (e as Error).message };
  }

  if (res.status === 404) {
    // Table not in the schema — finding stale or table renamed.
    return { table, status: "SKIP", detail: "404 — table not present" };
  }
  if (res.status === 401 || res.status === 403) {
    return { table, status: "BLOCK", detail: `${res.status} ${res.statusText}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { table, status: "ERROR", detail: `non-JSON ${res.status}` };
  }

  if (!res.ok) {
    const message =
      (body as { message?: string; code?: string })?.message ?? `HTTP ${res.status}`;
    const code = (body as { code?: string })?.code ?? "";
    // Some misconfigurations return 400 with code 42501 (insufficient privilege)
    if (code === "42501" || /permission denied/i.test(message)) {
      return { table, status: "BLOCK", detail: `${code} ${message}` };
    }
    return { table, status: "ERROR", detail: `${res.status}: ${message}` };
  }

  if (Array.isArray(body)) {
    if (body.length === 0) {
      return { table, status: "EMPTY", detail: "200 OK, [] — RLS or empty table" };
    }
    return {
      table,
      status: "LEAK",
      detail: `200 OK, ${body.length} row(s) returned`,
      rowsReturned: body.length,
    };
  }

  return { table, status: "ERROR", detail: `unexpected body shape: ${typeof body}` };
}

async function main(): Promise<void> {
  const envPath = resolve(
    process.cwd(),
    "apps",
    "web",
    ".env.local",
  );
  const env = loadEnv(envPath);
  const url = env["NEXT_PUBLIC_SUPABASE_URL"];
  const anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (!url || !anon) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or _ANON_KEY in apps/web/.env.local");
    process.exit(1);
  }

  console.log(`# RLS verification — anon JWT probe of ${TABLES.length} tables`);
  console.log(`# target: ${url}`);
  console.log(`# date:   ${new Date().toISOString()}`);
  console.log("");
  console.log("| Table | Status | Detail |");
  console.log("| --- | --- | --- |");

  const results: Row[] = [];
  for (const t of TABLES) {
    const r = await probe(url, anon, t);
    results.push(r);
    console.log(`| \`${r.table}\` | ${r.status} | ${r.detail} |`);
  }

  console.log("");
  const leaks = results.filter((r) => r.status === "LEAK");
  const blocks = results.filter((r) => r.status === "BLOCK");
  const empty = results.filter((r) => r.status === "EMPTY");
  const skip = results.filter((r) => r.status === "SKIP");
  const errors = results.filter((r) => r.status === "ERROR");
  console.log(`## Summary`);
  console.log(`- LEAK   (anon got rows): **${leaks.length}**`);
  console.log(`- BLOCK  (RLS or grants stop anon): ${blocks.length}`);
  console.log(`- EMPTY  (200 OK but []): ${empty.length}`);
  console.log(`- SKIP   (table not present): ${skip.length}`);
  console.log(`- ERROR  (transport/parse): ${errors.length}`);

  if (leaks.length > 0) {
    console.log("");
    console.log("## ⚠ Real exposures");
    for (const l of leaks) {
      console.log(`- \`${l.table}\` — ${l.detail}`);
    }
  }
}

void main();
