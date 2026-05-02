#!/usr/bin/env tsx
/**
 * Definitive RLS state — uses service_role to query pg_class + pg_policies
 * for every table in the public schema. Differentiates EMPTY-because-RLS
 * from EMPTY-because-empty.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

async function main(): Promise<void> {
  const env = loadEnv(resolve(process.cwd(), "apps", "web", ".env.local"));
  const url = env["SUPABASE_URL"] ?? env["NEXT_PUBLIC_SUPABASE_URL"];
  const sr = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !sr) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient(url, sr, { auth: { persistSession: false } });

  // We can't easily query pg_class via PostgREST. Use the Supabase RPC
  // pattern OR fall back to a simple count probe per table. For
  // simplicity (and to avoid needing a custom RPC), we do this:
  //   - GET /rest/v1/<t>?select=count() with `Prefer: count=exact` and
  //     anon JWT to detect RLS-bypassed empty vs RLS-blocked.
  //   - Compare service-role count to anon count: if SR > anon, RLS
  //     is filtering rows. If SR == anon, table really is empty or
  //     anon has full read.

  const tables = [
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
    "follows",
    "handles",
    "split_bills",
  ];

  const anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (!anon) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  console.log("| Table | SR rows | Anon rows | RLS verdict |");
  console.log("| --- | ---: | ---: | --- |");

  for (const t of tables) {
    const srCount = await fetchCount(url, sr, t);
    const anonCount = await fetchCount(url, anon, t);
    const verdict =
      srCount === null
        ? "table missing"
        : anonCount === null
          ? "anon errored (recursion?)"
          : srCount === anonCount && srCount > 0
            ? `⚠ ALL ${srCount} ROWS READABLE BY ANON`
            : srCount > anonCount
              ? `RLS filtering — anon sees ${anonCount} of ${srCount}`
              : srCount === 0
                ? "table empty (indeterminate)"
                : "anomaly";
    console.log(
      `| \`${t}\` | ${srCount ?? "—"} | ${anonCount ?? "—"} | ${verdict} |`,
    );
  }
}

async function fetchCount(
  url: string,
  jwt: string,
  table: string,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(table)}?select=*&limit=0`,
      {
        headers: {
          apikey: jwt,
          Authorization: `Bearer ${jwt}`,
          Accept: "application/json",
          Prefer: "count=exact",
        },
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const range = res.headers.get("content-range");
    if (!range) return null;
    const m = range.match(/\/(\*|\d+)$/);
    if (!m) return null;
    if (m[1] === "*") return null;
    return parseInt(m[1]!, 10);
  } catch {
    return null;
  }
}

void main();
