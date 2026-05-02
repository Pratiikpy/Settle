import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto-refill rules CRUD (F33.4).
 *
 *   GET    /api/auto-refill?owner=<pubkey> — list rules owned by a wallet
 *   POST   /api/auto-refill                 — create a new rule
 *   DELETE /api/auto-refill                 — delete by rule_id (must own)
 *
 * The rule itself is declarative — a separate cron (NOT part of this
 * route) reads enabled rules + current card balances and fires the
 * actual spend_via_pact. For now we store, list, and delete.
 *
 * Security: every mutation requires owner_pubkey to match the caller-
 * supplied wallet. A future signed-auth layer will replace the implicit
 * trust here; for now this is enough to keep accidental cross-wallet
 * pollution out.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const CreateBody = z.object({
  /** The delegated card the relayer spends FROM. */
  card_pubkey: z.string().regex(PUBKEY_RE),
  owner_pubkey: z.string().regex(PUBKEY_RE),
  /** Threshold: when dest_pubkey's USDC balance drops below this, refill. */
  threshold_lamports: z.string().regex(/^\d+$/),
  /** How much to send when triggered. */
  refill_lamports: z.string().regex(/^\d+$/),
  cooldown_seconds: z.number().int().min(60).max(86400).default(3600),
  /**
   * C40.2 — destination wallet whose balance we monitor + refill.
   * Defaults to owner_pubkey (refill yourself), but can be any wallet.
   */
  dest_pubkey: z.string().regex(PUBKEY_RE).optional(),
});

const DeleteBody = z.object({
  rule_id: z.string().uuid(),
  owner_pubkey: z.string().regex(PUBKEY_RE),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const owner = new URL(req.url).searchParams.get("owner");
  if (!owner || !PUBKEY_RE.test(owner)) {
    return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("auto_refill_rules")
    .select(
      "rule_id, card_pubkey, owner_pubkey, threshold_lamports, refill_lamports, cooldown_seconds, enabled, last_refill_at, created_at",
    )
    .eq("owner_pubkey", owner)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, rules: data ?? [] });
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  // Enforce: caller's owner_pubkey must actually own the card.
  const { data: card, error: cardErr } = await sb
    .from("agent_cards")
    .select("authority_pubkey")
    .eq("card_pubkey", parsed.data.card_pubkey)
    .maybeSingle();
  if (cardErr) {
    return NextResponse.json(
      { error: "supabase_error", message: cardErr.message },
      { status: 502 },
    );
  }
  if (!card) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }
  if (card.authority_pubkey !== parsed.data.owner_pubkey) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "owner_pubkey doesn't match card.authority_pubkey",
      },
      { status: 403 },
    );
  }

  const { data, error } = await sb
    .from("auto_refill_rules")
    .insert({
      card_pubkey: parsed.data.card_pubkey,
      owner_pubkey: parsed.data.owner_pubkey,
      threshold_lamports: parsed.data.threshold_lamports,
      refill_lamports: parsed.data.refill_lamports,
      cooldown_seconds: parsed.data.cooldown_seconds,
      // Default to refilling the owner's own wallet — most common case.
      dest_pubkey: parsed.data.dest_pubkey ?? parsed.data.owner_pubkey,
    })
    .select("rule_id")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, rule_id: data?.rule_id });
}

export async function DELETE(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = DeleteBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { error } = await sb
    .from("auto_refill_rules")
    .delete()
    .eq("rule_id", parsed.data.rule_id)
    .eq("owner_pubkey", parsed.data.owner_pubkey);
  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
