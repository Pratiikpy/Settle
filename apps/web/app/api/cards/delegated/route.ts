import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cards/delegated?owner=<pubkey>
 *
 * Returns the agent_cards owned by `owner` whose `agent_pubkey` matches
 * the relayer pubkey. These are the cards Phase 5 automation
 * (scheduled_sends, auto_refill_rules, gift_sends fulfillment) can
 * spend from when SETTLE_RELAYER_LIVE=true.
 *
 * Why no auth: this endpoint reveals only public-safe metadata (cap,
 * allowlist size, expiry) — same as the on-chain agent_cards account.
 * The actual spend authority is gated by the on-chain card.authority,
 * not by this endpoint. Skipping auth keeps the /wishes form simple
 * (no signed challenge dance just to populate a card-picker).
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface DelegatedCard {
  card_pubkey: string;
  label: string;
  daily_cap_lamports: string;
  per_call_max_lamports: string;
  expiry_slot: string;
  revoked: boolean;
  created_at: string;
}

function getRelayerPubkey(): string | null {
  const b58 = process.env.SETTLE_RELAYER_PRIVKEY;
  if (!b58) return null;
  try {
    const kp = Keypair.fromSecretKey(bs58.decode(b58));
    return kp.publicKey.toBase58();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  if (!owner || !PUBKEY_RE.test(owner)) {
    return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
  }

  const relayerPubkey = getRelayerPubkey();
  if (!relayerPubkey) {
    return NextResponse.json({
      ok: true,
      relayer_configured: false,
      relayer_pubkey: null,
      delegated_cards: [],
    });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("agent_cards")
    .select(
      "card_pubkey, label, daily_cap_lamports, per_call_max_lamports, expiry_slot, revoked, created_at",
    )
    .eq("authority_pubkey", owner)
    .eq("agent_pubkey", relayerPubkey)
    .eq("revoked", false)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cards: DelegatedCard[] = (data ?? []).map((c) => ({
    card_pubkey: c.card_pubkey,
    label: c.label,
    daily_cap_lamports: String(c.daily_cap_lamports),
    per_call_max_lamports: String(c.per_call_max_lamports),
    expiry_slot: String(c.expiry_slot),
    revoked: Boolean(c.revoked),
    created_at: String(c.created_at),
  }));

  return NextResponse.json({
    ok: true,
    relayer_configured: true,
    relayer_pubkey: relayerPubkey,
    delegated_cards: cards,
  });
}
