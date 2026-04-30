import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/cards/[id]/receipts?limit=20
 *
 * Returns receipts (ALLOW + DENY) for the given card or pact pubkey.
 * Receipts come from the `receipts` table maintained by the indexer + x402 proxy.
 *
 * NO mock data — if Supabase isn't configured, returns 503.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) {
    return NextResponse.json({ error: "invalid_card_id" }, { status: 400 });
  }

  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit") ?? "20")));

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "supabase_unconfigured", cards: [] },
      { status: 503 },
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Match either the card directly or any pact whose pact_pubkey is the requested id
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "request_id, card_pubkey, pact_pubkey, merchant_pubkey, amount_lamports, decision, deny_code, capability_hash, purpose_text_hash, purpose_hash, receipt_hash, reason_hash, policy_snapshot_hash, sig_solscan, decision_slot, policy_version, target_method, target_path, created_at",
    )
    .or(`card_pubkey.eq.${id},pact_pubkey.eq.${id}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    receipts: data ?? [],
    card_id: id,
    count: data?.length ?? 0,
  });
}
