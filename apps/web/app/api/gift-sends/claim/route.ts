import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.10.1 — Gift claim.
 *
 *   POST /api/gift-sends/claim
 *     { gift_id, claimer_pubkey, signature_b58 }
 *
 * The claimer signs a fixed message — `settle:claim-gift:<gift_id>` —
 * with their wallet. We verify the Ed25519 sig server-side, then mark
 * the gift `claimed`. A separate cron worker reads claimed rows and
 * fires the actual `direct_send` from `escrow_card` → `claimer_pubkey`.
 *
 * Note: we DON'T require the claimer to own the recipient_handle here.
 * The first wallet to sign the claim message wins. This is intentional
 * — gifts are often sent to handles for people who haven't claimed one
 * yet, and we want them to be claimable from any wallet they control.
 * The handle is just a discovery hint.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{86,90}$/;

const Body = z.object({
  gift_id: z.string().uuid(),
  claimer_pubkey: z.string().regex(PUBKEY_RE),
  signature_b58: z.string().regex(SIG_RE),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const v = parsed.data;

  // Verify the signed claim message.
  const message = new TextEncoder().encode(`settle:claim-gift:${v.gift_id}`);
  let ok = false;
  try {
    ok = ed25519.verify(bs58.decode(v.signature_b58), message, bs58.decode(v.claimer_pubkey));
  } catch {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }
  if (!ok) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Conditional update — only flip pending → claimed atomically.
  const { data, error } = await sb
    .from("gift_sends")
    .update({
      status: "claimed",
      claimer_pubkey: v.claimer_pubkey,
      claimed_at: new Date().toISOString(),
    })
    .eq("gift_id", v.gift_id)
    .eq("status", "pending")
    .select()
    .single();

  if (error || !data) {
    // Either the gift doesn't exist, was already claimed, or expired.
    return NextResponse.json(
      { error: "not_claimable", reason: error?.message ?? "already_claimed_or_missing" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, gift: data });
}
