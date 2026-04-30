#!/usr/bin/env tsx
/**
 * Seed Supabase with demo data needed for the 90-second demo flow.
 *
 * Usage:
 *   pnpm tsx scripts/seed-supabase.ts
 *
 * Pre-reqs:
 *   - Supabase project created
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 *   - Migrations 0001..0006 applied
 *   - Devnet keypairs in env for 5 demo merchants + 5 demo handles (real, base58-32-byte pubkeys)
 *
 * This script REFUSES to seed if any pubkey fails base58 decode to 32 bytes — no fake
 * "Arxv11111…" placeholders that look like pubkeys but aren't.
 */

import { createClient } from "@supabase/supabase-js";
import { PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

function requireRealPubkey(envName: string, value: string | undefined): string {
  if (!value) {
    console.error(`❌ ${envName} is unset. Set it to a real devnet pubkey (32-byte base58).`);
    process.exit(1);
  }
  try {
    new PublicKey(value);
  } catch {
    console.error(`❌ ${envName}=${value} is not a valid base58 32-byte pubkey.`);
    process.exit(1);
  }
  return value;
}

const MERCHANTS = [
  {
    merchant_pubkey: requireRealPubkey("MERCHANT_PUBKEY_ARXIV_FETCH", process.env.MERCHANT_PUBKEY_ARXIV_FETCH ?? process.env.NEXT_PUBLIC_MERCHANT_ARXIV),
    domain: "arxivfetch.demo",
    display_name: "ArxivFetch",
    verification_method: "manual_devnet_seed",
  },
  {
    merchant_pubkey: requireRealPubkey("MERCHANT_PUBKEY_TRANSLATE", process.env.MERCHANT_PUBKEY_TRANSLATE ?? process.env.NEXT_PUBLIC_MERCHANT_TRANSLATE),
    domain: "translateapi.demo",
    display_name: "TranslateAPI",
    verification_method: "manual_devnet_seed",
  },
  {
    merchant_pubkey: requireRealPubkey("MERCHANT_PUBKEY_SUMMARIZE", process.env.MERCHANT_PUBKEY_SUMMARIZE ?? process.env.NEXT_PUBLIC_MERCHANT_SUMMARY),
    domain: "summaryllm.demo",
    display_name: "SummaryLLM",
    verification_method: "manual_devnet_seed",
  },
];

// Handles seeding is OPTIONAL — only seed handles for which a real pubkey is provided.
interface HandleSeed {
  handle: string;
  pubkey: string;
  display_name?: string;
  sns_domain?: string;
}

const HANDLES: HandleSeed[] = [];
function maybeSeedHandle(handle: string, displayName: string, envName: string) {
  const v = process.env[envName];
  if (!v) {
    console.log(`  (skipping @${handle} — ${envName} unset)`);
    return;
  }
  try {
    new PublicKey(v);
  } catch {
    console.warn(`  (skipping @${handle} — ${envName}=${v} not a valid pubkey)`);
    return;
  }
  HANDLES.push({ handle, pubkey: v, display_name: displayName });
}

console.log("Building handles seed list…");
maybeSeedHandle("pratiik", "Pratiik", "DEMO_HANDLE_PRATIIK_PUBKEY");
maybeSeedHandle("elena", "Elena", "DEMO_HANDLE_ELENA_PUBKEY");
maybeSeedHandle("marco", "Marco", "DEMO_HANDLE_MARCO_PUBKEY");
maybeSeedHandle("yuki", "Yuki", "DEMO_HANDLE_YUKI_PUBKEY");
maybeSeedHandle("dev", "Dev Account", "DEMO_HANDLE_DEV_PUBKEY");

async function main() {
  console.log("\nSeeding verified_merchants…");
  const { error: mErr } = await supabase
    .from("verified_merchants")
    .upsert(MERCHANTS, { onConflict: "merchant_pubkey" });
  if (mErr) {
    console.error("merchants error:", mErr.message);
    process.exit(1);
  }
  console.log(`✓ ${MERCHANTS.length} merchants seeded`);

  if (HANDLES.length > 0) {
    console.log("\nSeeding handles…");
    const { error: hErr } = await supabase
      .from("handles")
      .upsert(HANDLES, { onConflict: "handle" });
    if (hErr) {
      console.error(
        "handles error:",
        hErr.message,
        "\n  Did you apply infra/supabase/migrations/0002_handles.sql?",
      );
      process.exit(1);
    }
    console.log(`✓ ${HANDLES.length} handles seeded`);
  } else {
    console.log("\nNo demo handles seeded (set DEMO_HANDLE_*_PUBKEY env vars to enable).");
  }

  console.log("\nDone. Verify in Supabase Studio → Table Editor.");
  console.log(`  Merchants: ${MERCHANTS.length}`);
  console.log(`  Handles:   ${HANDLES.length}`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
