import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auto-refill/attach-pact
 *
 * body: { rule_id, owner_pubkey, pact_pubkey, signature?, replace_existing? }
 *
 * Mirrors /api/scheduled-sends/attach-pact + /api/gift-sends/attach-pact.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const Body = z.object({
  rule_id: z.string().uuid(),
  owner_pubkey: z.string().regex(PUBKEY_RE),
  pact_pubkey: z.string().regex(PUBKEY_RE),
  replace_existing: z.boolean().default(false),
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

  let q = sb
    .from("auto_refill_rules")
    .update({ pact_pubkey: v.pact_pubkey })
    .eq("rule_id", v.rule_id)
    .eq("owner_pubkey", v.owner_pubkey);
  if (!v.replace_existing) q = q.is("pact_pubkey", null);

  const { data, error } = await q.select().single();

  if (error || !data) {
    return NextResponse.json(
      { error: "attach_failed", detail: error?.message ?? "no_writable_row" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, rule: data });
}
