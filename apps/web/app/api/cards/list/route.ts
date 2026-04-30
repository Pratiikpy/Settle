import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authFromRequest } from "../../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * GET /api/cards/list?authority=<pubkey>
 *
 * Returns the cards + pacts owned by the given authority.
 * Pacts are joined via parent_card → agent_cards.authority_pubkey.
 *
 * Auth: wallet-sig auth required. The signer (auth_pubkey) MUST match the `authority`
 * query param — otherwise anyone could enumerate any wallet's caps + spending state.
 */

export async function GET(req: NextRequest) {
  const authority = req.nextUrl.searchParams.get("authority");
  if (!authority || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(authority)) {
    return NextResponse.json({ error: "invalid_or_missing_authority" }, { status: 400 });
  }

  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth?.reason ?? "missing_signature" },
      { status: 401 },
    );
  }
  if (auth.pubkey !== authority) {
    return NextResponse.json(
      { error: "forbidden", message: "auth_pubkey does not match authority query param" },
      { status: 403 },
    );
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: cards, error: cErr } = await supabase
    .from("agent_cards")
    .select(
      "card_pubkey, authority_pubkey, agent_pubkey, label, daily_cap_lamports, per_call_max_lamports, used_today, expiry_slot, revoked, policy_version, created_at",
    )
    .eq("authority_pubkey", authority);

  if (cErr) {
    return NextResponse.json(
      { error: "cards_query_failed", message: cErr.message },
      { status: 500 },
    );
  }

  const cardPubkeys = (cards ?? []).map((c) => c.card_pubkey);

  let pacts: Array<{
    pact_pubkey: string;
    parent_card: string;
    scope_label: string;
    /** v0.3 — 'oneshot' | 'streaming'. Older rows default to 'oneshot'. */
    mode: "oneshot" | "streaming";
    cap_lamports: string | null;
    spent: string | null;
    rate_lamports_per_slot: string | null;
    max_total_lamports: string | null;
    claimed: string | null;
    paused: boolean;
    closed: boolean;
    expiry_slot: string;
    created_at: string;
  }> = [];

  if (cardPubkeys.length > 0) {
    const { data, error: pErr } = await supabase
      .from("pacts")
      .select(
        "pact_pubkey, parent_card, scope_label, mode, cap_lamports, spent, rate_lamports_per_slot, max_total_lamports, claimed, paused, expiry_slot, closed, created_at",
      )
      .in("parent_card", cardPubkeys)
      .order("created_at", { ascending: false });

    if (pErr) {
      return NextResponse.json(
        { error: "pacts_query_failed", message: pErr.message },
        { status: 500 },
      );
    }
    pacts = (data ?? []).map((row) => ({
      pact_pubkey: row.pact_pubkey,
      parent_card: row.parent_card,
      scope_label: row.scope_label,
      mode: (row.mode ?? "oneshot") as "oneshot" | "streaming",
      cap_lamports: row.cap_lamports != null ? String(row.cap_lamports) : null,
      spent: row.spent != null ? String(row.spent) : null,
      rate_lamports_per_slot:
        row.rate_lamports_per_slot != null ? String(row.rate_lamports_per_slot) : null,
      max_total_lamports:
        row.max_total_lamports != null ? String(row.max_total_lamports) : null,
      claimed: row.claimed != null ? String(row.claimed) : null,
      paused: Boolean(row.paused),
      closed: Boolean(row.closed),
      expiry_slot: String(row.expiry_slot),
      created_at: String(row.created_at),
    }));
  }

  return NextResponse.json({ ok: true, cards: cards ?? [], pacts });
}
