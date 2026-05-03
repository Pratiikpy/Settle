import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authFromRequest } from "../../../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * GET /api/handles/[handle]/relationship
 *
 * F15 — wallet-aware profile context. Wallet-sig auth required so a stranger reading
 * the page never sees this. Returns:
 *   is_following:        true if caller currently follows the handle
 *   you_sent_count:      ALLOW receipts where caller's cards paid this handle
 *   you_sent_total_usdc: lifetime $ caller has sent to this handle (USDC)
 *
 * The receipts query joins via agent_cards.authority_pubkey (caller's pubkey) →
 * agent_cards.card_pubkey → receipts.card_pubkey, so a single wallet's cards are all
 * counted (a user can have multiple cards on the same authority).
 */

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function lamportsToUsdc(l: bigint): string {
  const whole = l / 1_000_000n;
  const frac = l % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { handle } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }
  const normalized = handle.toLowerCase();

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  // Tag-prefixed error logger; matches /api/balance, /api/dashboard/v6, etc.
  const logErr = (tag: string, err: { message?: string } | null) => {
    if (err) console.warn(`[handles/:handle/relationship] ${tag} query failed:`, err.message);
  };

  // Resolve handle → pubkey
  const { data: handleRow, error: handleErr } = await supabase
    .from("handles")
    .select("pubkey")
    .eq("handle", normalized)
    .maybeSingle();
  logErr("handle", handleErr);
  if (!handleRow) {
    return NextResponse.json({ error: "handle_not_found" }, { status: 404 });
  }
  const targetPubkey = handleRow.pubkey as string;

  // Caller cards (so we can find their receipts to this merchant)
  const { data: callerCards, error: cardsErr } = await supabase
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", auth.pubkey);
  logErr("callerCards", cardsErr);
  const callerCardPubkeys = (callerCards ?? []).map((r) => r.card_pubkey as string);

  // Aggregate the lifetime payments + payment count from caller's cards to this merchant.
  let youSentCount = 0;
  let youSentTotal = 0n;
  if (callerCardPubkeys.length > 0) {
    const { data: rows, error: rowsErr } = await supabase
      .from("receipts")
      .select("amount_lamports")
      .eq("merchant_pubkey", targetPubkey)
      .eq("decision", "ALLOW")
      .in("card_pubkey", callerCardPubkeys);
    logErr("receipts", rowsErr);
    youSentCount = (rows ?? []).length;
    youSentTotal = (rows ?? []).reduce((s, r) => s + BigInt(r.amount_lamports), 0n);
  }

  // Follow state
  const { data: followRow, error: followErr } = await supabase
    .from("follows")
    .select("follower_pubkey")
    .eq("follower_pubkey", auth.pubkey)
    .eq("following_pubkey", targetPubkey)
    .maybeSingle();
  logErr("follows", followErr);

  return NextResponse.json({
    ok: true,
    handle: normalized,
    target_pubkey: targetPubkey,
    is_following: Boolean(followRow),
    you_sent_count: youSentCount,
    you_sent_total_usdc: lamportsToUsdc(youSentTotal),
  });
}
