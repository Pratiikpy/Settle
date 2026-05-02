import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/allowances/attach-kid-card
 *
 * body: { allowance_id, kid_pubkey, kid_card, signature? }
 *
 * Called by the kid after their create_card tx confirms. Binds the
 * new card_pubkey to allowances.kid_card so the allowances UI shows
 * "✓ kid card spawned" and the kid can start spending.
 *
 * Conditional update: only sets kid_card if it's currently NULL,
 * preventing overwrite from a confused double-call.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  allowance_id: z.string().regex(UUID_RE),
  kid_pubkey: z.string().regex(PUBKEY_RE),
  kid_card: z.string().regex(PUBKEY_RE),
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
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("allowances")
    .update({ kid_card: v.kid_card })
    .eq("allowance_id", v.allowance_id)
    .eq("kid_pubkey", v.kid_pubkey)
    .is("kid_card", null)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "attach_failed", detail: error?.message ?? "no_writable_row" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, allowance: data });
}
