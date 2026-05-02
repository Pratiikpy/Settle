import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cards/[id]/pacts
 *
 * Returns the pacts scoped under the given parent card. Used by the
 * card detail page to render a list of automation handles attached
 * to this card. No auth: pact metadata is on-chain anyway, and the
 * page already gates UI mutations (close pact) by wallet ownership.
 *
 * Response shape mirrors /api/cards/list's pacts array, narrowed to
 * just one parent_card.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!PUBKEY_RE.test(id)) {
    return NextResponse.json({ error: "invalid_card_pubkey" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("pacts")
    .select(
      "pact_pubkey, parent_card, scope_label, mode, cap_lamports, spent, rate_lamports_per_slot, max_total_lamports, claimed, paused, expiry_slot, closed, created_at",
    )
    .eq("parent_card", id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pacts = (data ?? []).map((row) => ({
    pact_pubkey: row.pact_pubkey,
    scope_label: row.scope_label,
    mode: (row.mode ?? "oneshot") as "oneshot" | "streaming",
    cap_lamports: row.cap_lamports != null ? String(row.cap_lamports) : null,
    spent: row.spent != null ? String(row.spent) : null,
    rate_lamports_per_slot:
      row.rate_lamports_per_slot != null
        ? String(row.rate_lamports_per_slot)
        : null,
    max_total_lamports:
      row.max_total_lamports != null ? String(row.max_total_lamports) : null,
    claimed: row.claimed != null ? String(row.claimed) : null,
    paused: Boolean(row.paused),
    closed: Boolean(row.closed),
    expiry_slot: String(row.expiry_slot),
    created_at: String(row.created_at),
  }));

  return NextResponse.json({ ok: true, card_pubkey: id, pacts });
}
