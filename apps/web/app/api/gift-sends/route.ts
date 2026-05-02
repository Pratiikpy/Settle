import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.10 — Claim-by-handle gift sends.
 *
 *   GET    /api/gift-sends?owner=<pubkey>          — list gifts I sent
 *   GET    /api/gift-sends?handle=<handle>         — list gifts ADDRESSED to a handle
 *   POST   /api/gift-sends                          — create a pending gift
 *   POST   /api/gift-sends/claim  (separate route)  — handle claims
 *
 * Why a separate `/claim` route: a claim requires the recipient's signed
 * attestation against the gift_id, which is a different shape than the
 * sender-only POST here. We keep auth surfaces narrow.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HANDLE_RE = /^[a-z0-9_-]{2,32}$/;

const CreateBody = z.object({
  sender_pubkey: z.string().regex(PUBKEY_RE),
  recipient_handle: z.string().regex(HANDLE_RE),
  escrow_card: z.string().regex(PUBKEY_RE),
  amount_lamports: z.string().regex(/^\d+$/),
  note: z.string().max(280).optional(),
  // Optional override: if unclaimed, refund here instead of sender_pubkey.
  refund_pubkey: z.string().regex(PUBKEY_RE).optional(),
  // Days until auto-expire. Default 30, max 365.
  expires_in_days: z.number().int().min(1).max(365).default(30),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner");
  const handle = url.searchParams.get("handle");
  if (!owner && !handle) {
    return NextResponse.json({ error: "owner_or_handle_required" }, { status: 400 });
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  let q = sb
    .from("gift_sends")
    .select(
      "gift_id, sender_pubkey, recipient_handle, escrow_card, amount_lamports, note, status, claimer_pubkey, claim_request_id, expires_at, created_at, claimed_at, refunded_at",
    );
  if (owner) {
    if (!PUBKEY_RE.test(owner)) {
      return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
    }
    q = q.eq("sender_pubkey", owner);
  } else if (handle) {
    if (!HANDLE_RE.test(handle)) {
      return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
    }
    q = q.eq("recipient_handle", handle.toLowerCase());
  }
  const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, gifts: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const expires = new Date(Date.now() + v.expires_in_days * 86400_000).toISOString();
  const { data, error } = await sb
    .from("gift_sends")
    .insert({
      sender_pubkey: v.sender_pubkey,
      recipient_handle: v.recipient_handle.toLowerCase(),
      escrow_card: v.escrow_card,
      amount_lamports: v.amount_lamports,
      note: v.note ?? null,
      refund_pubkey: v.refund_pubkey ?? v.sender_pubkey,
      expires_at: expires,
      status: "pending",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, gift: data });
}
