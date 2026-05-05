import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard?pubkey=<base58>
 *
 * One-shot summary endpoint for `/dashboard`. Aggregates the three Personal/
 * Business/Protocol "card" payloads in a single request so the dashboard
 * renders without a waterfall of N round-trips.
 *
 * Personal:
 *   - last 5 receipts the user is the buyer of (joins agent_cards by authority)
 *   - count of all-time received payments where the user is the merchant
 *   - count of pending refund_requests for receipts they bought
 *
 * Business:
 *   - active agent cards (revoked = false) owned by the user
 *   - open pacts under those cards (closed = false)
 *   - total spent_today across all the user's cards (sum of card.used_today)
 *
 * Protocol:
 *   - total receipts written across the system (last 24h, last 7d, all-time)
 *   - kind histogram: how many receipts per kind in the last 24h
 *
 * The query runs with the service role key (server-side only). No RLS issues
 * because we filter by the requester's pubkey ourselves — no broader read.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pubkey = url.searchParams.get("pubkey")?.trim();
  if (!pubkey) {
    return NextResponse.json({ error: "missing_pubkey" }, { status: 400 });
  }
  if (!PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  // ─────── Personal ───────

  // Cards owned by user (so we can join receipts on card_pubkey).
  const { data: ownedCards, error: cardsErr } = await sb
    .from("agent_cards")
    .select("card_pubkey, label, used_today, revoked, daily_cap_lamports")
    .eq("authority_pubkey", pubkey);
  if (cardsErr) {
    return NextResponse.json(
      { error: "supabase_error", message: cardsErr.message },
      { status: 502 },
    );
  }
  const cardPubkeys = (ownedCards ?? []).map((c) => c.card_pubkey);

  // Last 5 receipts the user authored (any kind) — limit to user's cards or as merchant.
  type ReceiptRow = {
    request_id: string;
    merchant_pubkey: string;
    card_pubkey: string;
    amount_lamports: string;
    decision: string;
    created_at: string;
    receipt_kind: string | null;
  };
  // Include receipts the user is the sender (card_pubkey ∈ owned cards OR
  // their wallet pubkey for direct_send), AND those they received as
  // merchant. Without this, /send → confirmed → 'no receipts yet' on the
  // dashboard, which is the central UX broken-window: user does the action
  // and the dashboard pretends nothing happened.
  let recentReceipts: ReceiptRow[] = [];
  // Match ANY of: card_pubkey is the user's pubkey (direct sends use this),
  // card_pubkey is one of the user's agent cards, OR merchant_pubkey is
  // the user (inbound).
  const cardKeysForFilter = [pubkey, ...cardPubkeys];
  const cardKeyFilter = cardKeysForFilter
    .map((k) => `card_pubkey.eq.${k}`)
    .join(",");
  const { data: recentData, error: recentErr } = await sb
    .from("receipts")
    .select(
      "request_id, merchant_pubkey, card_pubkey, amount_lamports, decision, created_at, receipt_kind",
    )
    .or(`${cardKeyFilter},merchant_pubkey.eq.${pubkey}`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (recentErr) {
    return NextResponse.json(
      { error: "supabase_error", message: recentErr.message },
      { status: 502 },
    );
  }
  recentReceipts = (recentData ?? []) as ReceiptRow[];

  // Count of inbound (user is merchant) — distinct from cards-they-own
  const { count: receivedCount } = await sb
    .from("receipts")
    .select("request_id", { count: "exact", head: true })
    .eq("merchant_pubkey", pubkey)
    .eq("decision", "ALLOW");

  // ─────── Business ───────

  const activeCards = (ownedCards ?? []).filter((c) => !c.revoked);
  type PactRow = { pact_pubkey: string; mode: string; closed: boolean; expiry_slot: string };
  let openPactsCount = 0;
  let openPacts: PactRow[] = [];
  if (cardPubkeys.length > 0) {
    const { data, error, count } = await sb
      .from("pacts")
      .select("pact_pubkey, mode, closed, expiry_slot", { count: "exact" })
      .in("parent_card", cardPubkeys)
      .eq("closed", false)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) {
      openPactsCount = count ?? 0;
      openPacts = (data ?? []) as PactRow[];
    }
  }

  const usedTodayLamports = (activeCards ?? []).reduce(
    (acc, c) => acc + Number(c.used_today ?? 0),
    0,
  );
  const dailyCapLamports = (activeCards ?? []).reduce(
    (acc, c) => acc + Number(c.daily_cap_lamports ?? 0),
    0,
  );

  // ─────── Protocol ───────

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count: total24h } = await sb
    .from("receipts")
    .select("request_id", { count: "exact", head: true })
    .gte("created_at", dayAgo);
  const { count: total7d } = await sb
    .from("receipts")
    .select("request_id", { count: "exact", head: true })
    .gte("created_at", weekAgo);
  const { count: totalAllTime } = await sb
    .from("receipts")
    .select("request_id", { count: "exact", head: true });

  // kind histogram for last 24h. We aggregate client-side because Supabase's
  // aggregate sql is gated; the row count in 24h is small enough that pulling
  // the kind column for each is cheap.
  const kindHistogram: Record<string, number> = {};
  const { data: kindRows } = await sb
    .from("receipts")
    .select("receipt_kind")
    .gte("created_at", dayAgo)
    .limit(5000);
  for (const r of kindRows ?? []) {
    const k = (r.receipt_kind as string | null) ?? "x402_spend";
    kindHistogram[k] = (kindHistogram[k] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    personal: {
      recent_receipts: recentReceipts,
      received_count: receivedCount ?? 0,
    },
    business: {
      active_cards: activeCards,
      active_card_count: activeCards.length,
      open_pacts: openPacts,
      open_pact_count: openPactsCount,
      used_today_lamports: String(usedTodayLamports),
      daily_cap_lamports: String(dailyCapLamports),
    },
    protocol: {
      total_24h: total24h ?? 0,
      total_7d: total7d ?? 0,
      total_all_time: totalAllTime ?? 0,
      kind_histogram_24h: kindHistogram,
    },
  });
}
