import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateCardsQuery } from "@settle/sdk";

export const runtime = "nodejs";

/**
 * GET /api/crosschain/cards?pubkey=<solana-base58>
 *
 * List cross-chain cards owned by a given Solana wallet (the on-chain
 * `CrosschainCard.authority`). Powers the dashboard "Cross-chain custody"
 * panel and the listing surfaces in `/cards/crosschain`.
 *
 * The on-chain `CrosschainCard` PDA is the source of truth; this endpoint
 * reads from `crosschain_cards`, the read-through cache populated by the
 * indexer worker. Renderers wanting authoritative state should derive the
 * PDA and read directly via RPC.
 *
 * Authentication: none (cards listed by `authority_pubkey` are not sensitive
 * — the same data is on-chain and publicly readable).
 */
export async function GET(req: NextRequest) {
  const validated = validateCardsQuery({
    pubkey: req.nextUrl.searchParams.get("pubkey") ?? undefined,
  });
  if (!validated.ok) {
    return NextResponse.json(
      { error: "invalid_payload", details: validated.errors },
      { status: 400 },
    );
  }
  const { pubkey } = validated.data;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: cards, error } = await supabase
    .from("crosschain_cards")
    .select(
      "card_pubkey, authority_pubkey, agent_pubkey, label, label_hash, dwallet_pubkey, gas_deposit_pubkey, target_chain, daily_cap_minor, per_call_max_minor, used_today_minor, last_reset_slot, expiry_slot, revoked, policy_version, created_at, updated_at",
    )
    .eq("authority_pubkey", pubkey)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[crosschain/cards] supabase select failed:", error.message);
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }

  if (!cards || cards.length === 0) {
    return NextResponse.json(
      { ok: true, pubkey, cards: [] },
      {
        // Empty list is cacheable for 30s — the indexer adds rows asynchronously
        // after `init_crosschain_card` lands on chain, so a missing card may
        // appear within 30s of card creation.
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
      },
    );
  }

  // For each card, attach allowlist rows for UI rendering. The allowlist is
  // small (≤8 entries per card), so an N+1 select is fine; if perf matters we
  // can switch to a single `IN (card_pubkeys)` query.
  const cardPubkeys = cards.map((c) => c.card_pubkey as string);
  const { data: allowlists, error: allowErr } = await supabase
    .from("crosschain_card_allowlist")
    .select(
      "card_pubkey, entry_index, chain_namespace, chain_reference, recipient_kind, recipient, asset_kind, asset, capability_hash",
    )
    .in("card_pubkey", cardPubkeys);
  if (allowErr) {
    console.warn("[crosschain/cards] allowlist lookup failed:", allowErr.message);
  }
  const allowsByCard = new Map<string, Array<Record<string, unknown>>>();
  for (const row of allowlists ?? []) {
    const arr = allowsByCard.get(row.card_pubkey as string) ?? [];
    arr.push(row);
    allowsByCard.set(row.card_pubkey as string, arr);
  }

  const out = cards.map((c) => ({
    card_pubkey: c.card_pubkey,
    authority_pubkey: c.authority_pubkey,
    agent_pubkey: c.agent_pubkey,
    label: (c.label as string | null) ?? null,
    label_hash: c.label_hash,
    dwallet_pubkey: c.dwallet_pubkey,
    gas_deposit_pubkey: c.gas_deposit_pubkey,
    target_chain: c.target_chain,
    // numerics come back as strings from numeric(40,0); pass through verbatim.
    daily_cap_minor: String(c.daily_cap_minor),
    per_call_max_minor: String(c.per_call_max_minor),
    used_today_minor: String(c.used_today_minor),
    last_reset_slot: String(c.last_reset_slot),
    expiry_slot: c.expiry_slot === null ? null : String(c.expiry_slot),
    revoked: Boolean(c.revoked),
    policy_version: Number(c.policy_version),
    created_at: c.created_at,
    updated_at: c.updated_at,
    allowlist: (allowsByCard.get(c.card_pubkey as string) ?? [])
      .sort((a, b) => Number(a.entry_index) - Number(b.entry_index))
      .map((a) => ({
        entry_index: Number(a.entry_index),
        chain_namespace: a.chain_namespace,
        chain_reference: a.chain_reference,
        recipient_kind: Number(a.recipient_kind),
        recipient: a.recipient,
        asset_kind: Number(a.asset_kind),
        asset: a.asset,
        capability_hash: (a.capability_hash as string | null) ?? null,
      })),
  }));

  return NextResponse.json(
    { ok: true, pubkey, cards: out },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
  );
}
