import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/leaderboard
 *
 * Top capability hashes by total volume across all merchants. Powers the /leaderboard
 * index page. Reads `capability_leaderboard_summary` view (P8).
 */

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(_req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await supabase
    .from("capability_leaderboard_summary")
    .select("capability_hash, total_volume, completed, merchant_count, last_used_at")
    .limit(50);
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    capabilities: (data ?? []).map((r) => ({
      capability_hash: r.capability_hash,
      total_volume: r.total_volume,
      completed: r.completed,
      merchant_count: r.merchant_count,
      last_used_at: r.last_used_at,
    })),
  });
}
