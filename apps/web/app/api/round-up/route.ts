import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireOwnerAuth } from "../../../lib/require-owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.6 — Round-up rule CRUD.
 *
 *   GET    /api/round-up?owner=<pubkey>   — current rule (one per owner)
 *   POST   /api/round-up                   — upsert
 *   DELETE /api/round-up                   — disable
 *
 * Schema enforces ONE rule per owner (round_one_per_owner unique constraint).
 * Allowed round_to_lamports presets: 50_000 ($0.05), 100_000 ($0.10),
 * 500_000 ($0.50), 1_000_000 ($1.00), 5_000_000 ($5.00). The check below
 * rejects any other value to keep the UI selector and the schema in sync.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALLOWED_ROUND = new Set(["50000", "100000", "500000", "1000000", "5000000"]);

const Body = z.object({
  owner_pubkey: z.string().regex(PUBKEY_RE),
  round_to_lamports: z.string().refine((v) => ALLOWED_ROUND.has(v), {
    message: "round_to_lamports must be one of 50000|100000|500000|1000000|5000000",
  }),
  dest_pubkey: z.string().regex(PUBKEY_RE),
  daily_cap_lamports: z.string().regex(/^\d+$/).optional(),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    .from("round_up_rules")
    .select(
      "rule_id, owner_pubkey, round_to_lamports, dest_pubkey, daily_cap_lamports, enabled, created_at",
    )
    .eq("owner_pubkey", owner)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rule: data });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const authFail = await requireOwnerAuth(req, v.owner_pubkey);
  if (authFail) return authFail;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  // Upsert by owner: delete prior + insert. Doing it as two ops avoids
  // wrestling with PostgREST upsert nuances around unique constraints.
  await sb.from("round_up_rules").delete().eq("owner_pubkey", v.owner_pubkey);
  const { data, error } = await sb
    .from("round_up_rules")
    .insert({
      owner_pubkey: v.owner_pubkey,
      round_to_lamports: v.round_to_lamports,
      dest_pubkey: v.dest_pubkey,
      daily_cap_lamports: v.daily_cap_lamports ?? null,
      enabled: true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rule: data });
}

export async function DELETE(req: NextRequest) {
  let body: { owner_pubkey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.owner_pubkey || !PUBKEY_RE.test(body.owner_pubkey)) {
    return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
  }
  const authFail = await requireOwnerAuth(req, body.owner_pubkey);
  if (authFail) return authFail;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { error } = await sb
    .from("round_up_rules")
    .delete()
    .eq("owner_pubkey", body.owner_pubkey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
