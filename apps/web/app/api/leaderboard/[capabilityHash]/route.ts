import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/leaderboard/[capabilityHash]
 *
 * F17 — Public capability leaderboard. Reads `capability_leaderboard` view (P8).
 *
 * Returns merchants ranked by total_volume desc for a given capability hash. Two
 * latency numbers per row:
 *
 *   avg_total_latency_ms     — entry-to-exit through the proxy (user-visible feel)
 *   avg_merchant_latency_ms  — upstream-only (defensible "merchant speed")
 *
 * Both are server-clock consistent (P10). Pre-P10 receipts are excluded from the
 * average via the view's `filter` clause — never silently zero-imputed.
 */

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ capabilityHash: string }> },
) {
  const { capabilityHash } = await params;
  if (!/^[0-9a-fA-F]{64}$/.test(capabilityHash)) {
    return NextResponse.json({ error: "invalid_capability_hash" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await supabase
    .from("capability_leaderboard")
    .select(
      "capability_hash, merchant_pubkey, completed, avg_total_latency_ms, avg_merchant_latency_ms, avg_amount_lamports, total_volume, unique_users, last_used_at",
    )
    .eq("capability_hash", `\\x${capabilityHash}`)
    .order("total_volume", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  // Resolve merchant handles for display, where available.
  const merchantPubkeys = (data ?? []).map((r) => r.merchant_pubkey as string);
  let handlesMap: Record<string, string> = {};
  if (merchantPubkeys.length > 0) {
    const { data: handleRows } = await supabase
      .from("handles")
      .select("handle, pubkey")
      .in("pubkey", merchantPubkeys);
    handlesMap = Object.fromEntries(
      (handleRows ?? []).map((h) => [h.pubkey as string, h.handle as string]),
    );
  }

  return NextResponse.json({
    ok: true,
    capability_hash: capabilityHash,
    merchants: (data ?? []).map((r) => ({
      merchant_pubkey: r.merchant_pubkey,
      handle: handlesMap[r.merchant_pubkey as string] ?? null,
      completed: r.completed,
      avg_total_latency_ms: r.avg_total_latency_ms,
      avg_merchant_latency_ms: r.avg_merchant_latency_ms,
      avg_amount_lamports: r.avg_amount_lamports,
      total_volume: r.total_volume,
      unique_users: r.unique_users,
      last_used_at: r.last_used_at,
    })),
  });
}
