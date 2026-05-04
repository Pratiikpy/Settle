import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * GET /api/crosschain/cards/[card_pubkey]
 *
 * Direct lookup by `CrosschainCard` PDA. Powers the
 * `/cards/crosschain/[card_pubkey]` detail page.
 *
 * 404 if the indexer hasn't seen this PDA yet (within ~30s of init the row
 * may not have propagated).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ card_pubkey: string }> },
) {
  const { card_pubkey } = await params;
  if (!PUBKEY_RE.test(card_pubkey)) {
    return NextResponse.json({ error: "invalid_card_pubkey" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: card, error } = await supabase
    .from("crosschain_cards")
    .select(
      "card_pubkey, authority_pubkey, agent_pubkey, label, label_hash, dwallet_pubkey, gas_deposit_pubkey, target_chain, daily_cap_minor, per_call_max_minor, used_today_minor, last_reset_slot, expiry_slot, revoked, policy_version, created_at, updated_at",
    )
    .eq("card_pubkey", card_pubkey)
    .maybeSingle();

  if (error) {
    console.warn("[crosschain/cards/:id] supabase select failed:", error.message);
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  if (!card) {
    return NextResponse.json(
      { error: "card_not_found", card_pubkey },
      { status: 404 },
    );
  }

  const { data: allowlist, error: allowErr } = await supabase
    .from("crosschain_card_allowlist")
    .select(
      "entry_index, chain_namespace, chain_reference, recipient_kind, recipient, asset_kind, asset, capability_hash",
    )
    .eq("card_pubkey", card_pubkey)
    .order("entry_index", { ascending: true });
  if (allowErr) {
    console.warn("[crosschain/cards/:id] allowlist lookup failed:", allowErr.message);
  }

  return NextResponse.json(
    {
      ok: true,
      card: {
        card_pubkey: card.card_pubkey,
        authority_pubkey: card.authority_pubkey,
        agent_pubkey: card.agent_pubkey,
        label: (card.label as string | null) ?? null,
        label_hash: card.label_hash,
        dwallet_pubkey: card.dwallet_pubkey,
        gas_deposit_pubkey: card.gas_deposit_pubkey,
        target_chain: card.target_chain,
        daily_cap_minor: String(card.daily_cap_minor),
        per_call_max_minor: String(card.per_call_max_minor),
        used_today_minor: String(card.used_today_minor),
        last_reset_slot: String(card.last_reset_slot),
        expiry_slot: card.expiry_slot === null ? null : String(card.expiry_slot),
        revoked: Boolean(card.revoked),
        policy_version: Number(card.policy_version),
        created_at: card.created_at,
        updated_at: card.updated_at,
        allowlist: (allowlist ?? []).map((a) => ({
          entry_index: Number(a.entry_index),
          chain_namespace: a.chain_namespace,
          chain_reference: a.chain_reference,
          recipient_kind: Number(a.recipient_kind),
          recipient: a.recipient,
          asset_kind: Number(a.asset_kind),
          asset: a.asset,
          capability_hash: (a.capability_hash as string | null) ?? null,
        })),
      },
    },
    {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
    },
  );
}
