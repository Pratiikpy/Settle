import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/handles/[handle]/profile
 *
 * Public profile data for a Settle handle. Returns:
 *   - handle metadata
 *   - card pubkeys owned by the handle's authority
 *   - public-feed-flagged receipts (filtered by public_feed=true)
 *
 * No auth required — only returns data the user has explicitly opted to make public.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }
  const normalized = handle.toLowerCase();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: handleRow, error: hErr } = await supabase
    .from("handles")
    .select("handle, pubkey, sns_domain, display_name, avatar_url, created_at")
    .eq("handle", normalized)
    .maybeSingle();

  if (hErr) {
    return NextResponse.json({ error: "supabase_error", message: hErr.message }, { status: 502 });
  }
  if (!handleRow) {
    return NextResponse.json({ error: "handle_not_found" }, { status: 404 });
  }

  // Cards owned by this handle's authority
  const { data: cards } = await supabase
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", handleRow.pubkey);
  const cardPubkeys = (cards ?? []).map((c) => c.card_pubkey);

  // Public-feed-flagged receipts
  let publicReceipts: Array<{
    request_id: string;
    merchant_pubkey: string;
    amount_lamports: string;
    decision_slot: number;
    sig_solscan: string | null;
    created_at: string;
  }> = [];
  if (cardPubkeys.length > 0) {
    const { data } = await supabase
      .from("receipts")
      .select(
        "request_id, merchant_pubkey, amount_lamports, decision_slot, sig_solscan, created_at",
      )
      .in("card_pubkey", cardPubkeys)
      .eq("decision", "ALLOW")
      .eq("public_feed", true)
      .order("created_at", { ascending: false })
      .limit(20);
    publicReceipts = data ?? [];
  }

  // Total public-feed spend
  const totalPublicLamports = publicReceipts.reduce(
    (sum, r) => sum + BigInt(r.amount_lamports),
    0n,
  );
  function lamportsToUsdc(l: bigint): string {
    const whole = l / 1_000_000n;
    const frac = l % 1_000_000n;
    return `${whole}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
  }

  // F18 — Public earnings transparency.
  //
  // Aggregates all ALLOW + public_feed receipts where merchant_pubkey = handle.pubkey.
  // The receipts are already public-by-opt-in (the buyer's card.public_feed_default
  // controls visibility), so this is a display surface, not a new opt-in path. The
  // handle's owner can hide their inbound flow by ensuring their own cards keep
  // public_feed_default=false; receipts they receive *from others* who chose public
  // are inherently visible because that's how those buyers chose to broadcast.
  //
  // Three numbers:
  //   lifetime_earned_usdc — all-time
  //   last_30_days_usdc    — rolling window
  //   top_senders_count    — distinct unique buyers
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [
    { data: lifetimeEarnedRows },
    { data: last30DaysRows },
    { data: topSendersRows },
    { data: recentInboundRows },
  ] = await Promise.all([
    supabase
      .from("receipts")
      .select("amount_lamports")
      .eq("merchant_pubkey", handleRow.pubkey)
      .eq("decision", "ALLOW")
      .eq("public_feed", true),
    supabase
      .from("receipts")
      .select("amount_lamports")
      .eq("merchant_pubkey", handleRow.pubkey)
      .eq("decision", "ALLOW")
      .eq("public_feed", true)
      .gte("created_at", since30),
    supabase
      .from("receipts")
      .select("card_pubkey")
      .eq("merchant_pubkey", handleRow.pubkey)
      .eq("decision", "ALLOW")
      .eq("public_feed", true),
    supabase
      .from("receipts")
      .select("request_id, card_pubkey, amount_lamports, capability_hash, sig_solscan, created_at")
      .eq("merchant_pubkey", handleRow.pubkey)
      .eq("decision", "ALLOW")
      .eq("public_feed", true)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const lifetimeEarned = (lifetimeEarnedRows ?? []).reduce(
    (sum, r) => sum + BigInt(r.amount_lamports),
    0n,
  );
  const last30Days = (last30DaysRows ?? []).reduce(
    (sum, r) => sum + BigInt(r.amount_lamports),
    0n,
  );
  const distinctSenders = new Set((topSendersRows ?? []).map((r) => r.card_pubkey)).size;

  return NextResponse.json({
    ok: true,
    handle: handleRow.handle,
    pubkey: handleRow.pubkey,
    sns_domain: handleRow.sns_domain,
    display_name: handleRow.display_name,
    avatar_url: handleRow.avatar_url,
    created_at: handleRow.created_at,
    public_receipts_count: publicReceipts.length,
    public_total_usdc: lamportsToUsdc(totalPublicLamports),
    public_receipts: publicReceipts,
    // F18 earnings block — present when there's any inbound public flow.
    earnings: {
      lifetime_earned_usdc: lamportsToUsdc(lifetimeEarned),
      last_30_days_usdc: lamportsToUsdc(last30Days),
      top_senders_count: distinctSenders,
      recent_inbound: recentInboundRows ?? [],
    },
  });
}
