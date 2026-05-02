import { NextResponse } from "next/server";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import bs58 from "bs58";
import {
  cronSecretStatus,
  liveModeStatus,
  relayerStatus,
  summarizeChecks,
  webhookSigningStatus,
  type CheckResult,
} from "@settle/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/preflight
 *
 * Operator-side configuration probe. Returns a checklist of every
 * deployment-time gate Phase 5 needs, with green / red / warning
 * statuses + a hint for each. Powers /admin/preflight UI.
 *
 * Why a single endpoint vs. checking each piece in its own route:
 *   - Reading 5+ env vars + 2 RPC pings + 1 Supabase ping in parallel
 *     completes faster than the user navigating between separate
 *     pages.
 *   - The shape is uniform: each check is { name, status, hint }, so
 *     the UI is one map.
 *
 * No auth: returns only configuration STATUSES (boolean), never the
 * underlying secrets. An operator-only UI further gates the page
 * behind a hardcoded admin-pubkey allow-list (handled in the page).
 */

// CheckResult shape lives in @settle/sdk now (preflight-status). Re-import.

async function checkSupabase(): Promise<CheckResult> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return {
      name: "Supabase configured",
      status: "red",
      hint: "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set.",
    };
  }
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await sb
      .from("agent_cards")
      .select("card_pubkey", { count: "exact", head: true })
      .limit(1);
    if (error) {
      return {
        name: "Supabase reachable",
        status: "red",
        hint: `Query failed: ${error.message}. Check service-role key + RLS policies.`,
      };
    }
    return {
      name: "Supabase reachable",
      status: "green",
      hint: "Read against agent_cards succeeded.",
    };
  } catch (e) {
    return {
      name: "Supabase reachable",
      status: "red",
      hint: `Transport error: ${(e as Error).message}`,
    };
  }
}

async function checkLatestMigration(): Promise<CheckResult> {
  // Probe for column existence as a cheap "is the latest migration
  // applied?" check. We pick a column added in the latest migration —
  // gift_sends.pact_pubkey (0036). If missing, alert.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { name: "Latest migration applied", status: "red", hint: "Supabase not configured." };
  }
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await sb.from("gift_sends").select("pact_pubkey").limit(1);
    if (error) {
      // Column missing if migrations behind.
      return {
        name: "Latest migration applied",
        status: "red",
        hint: `gift_sends.pact_pubkey not found — apply 0036_gift_pact.sql. (${error.message})`,
      };
    }
    return {
      name: "Latest migration applied",
      status: "green",
      hint: "0036_gift_pact column present — schema up-to-date.",
    };
  } catch (e) {
    return {
      name: "Latest migration applied",
      status: "yellow",
      hint: `Couldn't probe schema: ${(e as Error).message}`,
    };
  }
}

function checkRelayer(): CheckResult {
  // C99 — pure status mapping lives in @settle/sdk so it can be unit-tested.
  // The route handler does the IO (env reads + Keypair.fromSecretKey decode).
  const b58 = process.env.SETTLE_RELAYER_PRIVKEY;
  if (!b58) {
    return relayerStatus({
      privkeyB58: undefined,
      decodedPubkey: null,
      decodeError: null,
    });
  }
  try {
    const kp = Keypair.fromSecretKey(bs58.decode(b58));
    return relayerStatus({
      privkeyB58: b58,
      decodedPubkey: kp.publicKey.toBase58(),
      decodeError: null,
    });
  } catch (e) {
    return relayerStatus({
      privkeyB58: b58,
      decodedPubkey: null,
      decodeError: (e as Error).message,
    });
  }
}

function checkLiveFlag(): CheckResult {
  return liveModeStatus(process.env.SETTLE_RELAYER_LIVE);
}

function checkCronSecret(): CheckResult {
  return cronSecretStatus(process.env.CRON_SECRET);
}

async function checkRpc(): Promise<CheckResult> {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  let rpcUrl: string;
  if (explicit) rpcUrl = explicit;
  else if (heliusKey) rpcUrl = `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  else rpcUrl = clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
  try {
    const conn = new Connection(rpcUrl, { commitment: "confirmed" });
    const slot = await conn.getSlot("confirmed");
    return {
      name: "Solana RPC reachable",
      status: "green",
      hint: `Slot ${slot} on ${cluster}.`,
    };
  } catch (e) {
    return {
      name: "Solana RPC reachable",
      status: "red",
      hint: `RPC error: ${(e as Error).message}. Check NEXT_PUBLIC_RPC_URL or HELIUS_API_KEY.`,
    };
  }
}

function checkWebhookSigning(): CheckResult {
  return webhookSigningStatus(process.env.SETTLE_WEBHOOK_SIGNING_SECRET);
}

export async function GET() {
  const checks: CheckResult[] = await Promise.all([
    checkSupabase(),
    checkLatestMigration(),
    Promise.resolve(checkRelayer()),
    Promise.resolve(checkLiveFlag()),
    Promise.resolve(checkCronSecret()),
    checkRpc(),
    Promise.resolve(checkWebhookSigning()),
  ]);

  const summary = summarizeChecks(checks);

  return NextResponse.json({
    ok: summary.ok,
    counts: { green: summary.green, yellow: summary.yellow, red: summary.red },
    checks,
  });
}
