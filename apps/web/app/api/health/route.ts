import { NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { checkCnftSetup } from "../../../lib/cnft";
import { SETTLE_PROGRAM_ID } from "../../../lib/anchor-client";

export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Reports which integrations are configured and reachable.
 * Used by:
 *   - UptimeRobot 6h ping (keeps Supabase free tier warm)
 *   - Hackathon judges spot-checking that integrations are real
 *   - Pre-submission verifier agent on May 10
 *
 * Each check is independent — one failing doesn't affect others.
 * Status code: 200 if all critical checks pass, 503 otherwise.
 */

interface CheckResult {
  ok: boolean;
  detail?: string;
  data?: Record<string, unknown>;
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

async function checkSolanaRpc(): Promise<CheckResult> {
  try {
    const conn = new Connection(getRpcUrl(), { commitment: "confirmed" });
    const slot = await conn.getSlot("confirmed");
    return { ok: true, data: { current_slot: slot } };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function checkProgram(): Promise<CheckResult> {
  try {
    const conn = new Connection(getRpcUrl(), { commitment: "confirmed" });
    const info = await conn.getAccountInfo(SETTLE_PROGRAM_ID, "confirmed");
    if (!info) {
      return {
        ok: false,
        detail: `Program ${SETTLE_PROGRAM_ID.toBase58()} not deployed yet — run \`pnpm deploy:devnet\``,
      };
    }
    return {
      ok: info.executable,
      ...(info.executable ? {} : { detail: "Account exists but is not executable" }),
      data: { program_id: SETTLE_PROGRAM_ID.toBase58(), owner: info.owner.toBase58() },
    };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function checkSupabase(): Promise<CheckResult> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { ok: false, detail: "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY not set" };
  }
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    // Test query against a table that should exist after migrations
    const { error } = await supabase.from("verified_merchants").select("merchant_pubkey").limit(1);
    if (error) {
      return {
        ok: false,
        detail: `migrations not applied: ${error.message}`,
      };
    }
    return { ok: true, data: { url } };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function checkUpstash(): Promise<CheckResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return { ok: false, detail: "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN not set" };
  }
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const json = (await res.json()) as { result?: string };
    return { ok: json.result === "PONG", detail: `result=${json.result}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function checkFacilitator(): Promise<CheckResult> {
  const fk = process.env.SETTLE_FACILITATOR_PRIVKEY;
  if (!fk) return { ok: false, detail: "SETTLE_FACILITATOR_PRIVKEY not set" };
  try {
    // dynamic import to avoid pulling bs58 into edge bundles
    const bs58Mod = (await import("bs58")).default;
    const decoded = Buffer.from(bs58Mod.decode(fk) ?? new Uint8Array());
    if (decoded.length !== 64) {
      return { ok: false, detail: `expected 64 bytes, got ${decoded.length}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function checkDemoMerchants(): Promise<CheckResult> {
  const url = process.env.DEMO_MERCHANTS_URL ?? "http://localhost:8788";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const json = await res.json();
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export async function GET() {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

  const [solana, program, supabase, upstash, facilitator, demoMerchants] = await Promise.all([
    checkSolanaRpc(),
    checkProgram(),
    checkSupabase(),
    checkUpstash(),
    checkFacilitator(),
    checkDemoMerchants(),
  ]);

  const cnft = checkCnftSetup();

  const checks = {
    solana_rpc: solana,
    settle_program: program,
    supabase,
    upstash_redis: upstash,
    facilitator_keypair: facilitator,
    cnft_infra: {
      ok: cnft.ready,
      ...(cnft.reason ? { detail: cnft.reason } : {}),
      data: { tree: cnft.tree, collection: cnft.collection },
    },
    demo_merchants: demoMerchants,
  };

  // Critical = required for the spend flow to function end-to-end
  const critical = [solana.ok, program.ok, supabase.ok, upstash.ok, facilitator.ok];
  const allCriticalOk = critical.every((x) => x);

  return NextResponse.json(
    {
      ok: allCriticalOk,
      cluster,
      service: "settle-web",
      version: "0.2.0-consumer",
      time: new Date().toISOString(),
      checks,
      summary: {
        critical_passing: critical.filter(Boolean).length,
        critical_total: critical.length,
        enrichment_passing: [cnft.ready, demoMerchants.ok].filter(Boolean).length,
        enrichment_total: 2,
      },
    },
    { status: allCriticalOk ? 200 : 503 },
  );
}
