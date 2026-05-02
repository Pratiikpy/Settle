#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  for (const fn of ["exec_sql", "exec", "sql", "pg_query", "pgmeta_query", "execute"]) {
    const { data, error } = await sb.rpc(fn, { query: "select 1" });
    if (error) console.log(`rpc ${fn.padEnd(15)} → ${error.message}`);
    else console.log(`rpc ${fn.padEnd(15)} → WORKS, returned ${JSON.stringify(data)}`);
  }
  // Also try the Postgres meta endpoint sometimes exposed
  const metaUrl = `${url}/pg/sql`;
  const r = await fetch(metaUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select 1" }),
  }).catch((e) => ({ ok: false, status: 0, text: () => Promise.resolve(String(e)) }) as any);
  console.log(`pg/sql endpoint  → status ${r.status}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
