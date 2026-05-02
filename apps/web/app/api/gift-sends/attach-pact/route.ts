import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/gift-sends/attach-pact
 *
 * body: { gift_id, sender_pubkey, pact_pubkey, signature? }
 *
 * Mirrors /api/scheduled-sends/attach-pact. Called by the client
 * after a successful open_pact; binds pact_pubkey to the gift_sends
 * row so the signer cron picks it up.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const Body = z.object({
  gift_id: z.string().uuid(),
  sender_pubkey: z.string().regex(PUBKEY_RE),
  pact_pubkey: z.string().regex(PUBKEY_RE),
  signature: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const v = parsed.data;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("gift_sends")
    .update({ pact_pubkey: v.pact_pubkey })
    .eq("gift_id", v.gift_id)
    .eq("sender_pubkey", v.sender_pubkey)
    .is("pact_pubkey", null)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "attach_failed", detail: error?.message ?? "no_writable_row" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, gift: data });
}
