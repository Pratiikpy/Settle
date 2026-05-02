#!/usr/bin/env tsx
/**
 * Seeds the capability_registry with canonical entries the demo + first
 * users will recognize. These are computed via the same SDK function the
 * server uses to verify, so verified=true on insert.
 */
import { createClient } from "@supabase/supabase-js";
import { computeCapabilityHashHex } from "../packages/sdk/dist/index.js";

interface Seed {
  alias: string;
  description: string;
  spec: {
    domain: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    amount_lamports: string;
    version: number;
  };
}

const SEEDS: Seed[] = [
  {
    alias: "Fetch arXiv abstract",
    description:
      "Retrieve the abstract + metadata of a single arXiv paper by ID. Read-only.",
    spec: {
      domain: "arxiv.org",
      method: "GET",
      path: "/abs/:id",
      amount_lamports: "10000",
      version: 1,
    },
  },
  {
    alias: "Translate EN→FR",
    description: "Translate English text to French via the demo translate merchant.",
    spec: {
      domain: "translate.demo.settle",
      method: "POST",
      path: "/v1/translate",
      amount_lamports: "20000",
      version: 1,
    },
  },
  {
    alias: "Summarize URL",
    description: "Fetch the URL and return a 200-word summary.",
    spec: {
      domain: "summary.demo.settle",
      method: "POST",
      path: "/v1/summarize",
      amount_lamports: "30000",
      version: 1,
    },
  },
];

async function main() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const seeder =
    process.env.SETTLE_DEPLOYER_PUBKEY ??
    "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";

  for (const s of SEEDS) {
    const hash = computeCapabilityHashHex(s.spec);
    const row = {
      capability_hash: hash,
      alias: s.alias,
      description: s.description,
      spec_domain: s.spec.domain,
      spec_method: s.spec.method,
      spec_path: s.spec.path,
      spec_amount_lamports: s.spec.amount_lamports,
      spec_version: s.spec.version,
      verified: true, // we just computed the hash from the spec
      contributed_by_pubkey: seeder,
    };
    const { error } = await sb.from("capability_registry").insert(row);
    if (error && error.code !== "23505") {
      console.error(`✗ ${s.alias}: ${error.message}`);
    } else {
      console.log(`✓ ${s.alias} → ${hash.slice(0, 16)}…${error ? " (already)" : ""}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
