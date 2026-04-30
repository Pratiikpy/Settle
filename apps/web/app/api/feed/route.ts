import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/feed?limit=50
 *
 * Returns the public live feed — recent ALLOW decisions + agent task spawns.
 * Sourced from `policy_decisions` table maintained by the indexer.
 *
 * Privacy: only rows where the originating card has public-feed=on are returned.
 * For V1 the privacy column doesn't exist yet; all events are public until we add it.
 */

export async function GET(req: NextRequest) {
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit") ?? "50")));

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "supabase_unconfigured", events: [] },
      { status: 503 },
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Join policy_decisions with receipts to apply the public_feed privacy filter.
  // Only show events whose receipt.public_feed = true. (Receipts table has the toggle.)
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "card_pubkey, merchant_pubkey, pact_pubkey, decision, deny_code, amount_lamports, sig_solscan, decision_slot, created_at",
    )
    .eq("decision", "ALLOW")
    .eq("public_feed", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, events: data ?? [], count: data?.length ?? 0 });
}
