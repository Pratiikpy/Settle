import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.5 — Save-for-X buckets CRUD.
 *
 *   GET    /api/save-for?owner=<pubkey>
 *   POST   /api/save-for
 *   PATCH  /api/save-for { bucket_id, owner_pubkey, ...partial }
 *   DELETE /api/save-for { bucket_id, owner_pubkey }
 *
 * The bucket itself is a row; actual savings live on a separate Pact
 * card pointed to by `holding_card`. We don't enforce that the user has
 * spawned the card before creating the bucket — they can do it in
 * either order — but we surface the missing card in GET so the UI can
 * prompt for it.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CADENCE_VALUES = ["DAILY", "WEEKLY", "MONTHLY"] as const;

const CreateBody = z.object({
  owner_pubkey: z.string().regex(PUBKEY_RE),
  label: z.string().min(1).max(80),
  target_lamports: z.string().regex(/^\d+$/),
  target_by: z.string().datetime().optional(),
  contribution_lamports: z.string().regex(/^\d+$/).optional(),
  contribution_cadence: z.enum(CADENCE_VALUES).optional(),
  category: z.enum(["ai", "rent", "vacation", "bills", "other"]).default("other"),
  holding_card: z.string().regex(PUBKEY_RE).optional(),
});

const PatchBody = z.object({
  bucket_id: z.string().uuid(),
  owner_pubkey: z.string().regex(PUBKEY_RE),
  holding_card: z.string().regex(PUBKEY_RE).optional(),
  label: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  completed: z.boolean().optional(),
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
    .from("save_for_buckets")
    .select(
      "bucket_id, owner_pubkey, holding_card, label, target_lamports, target_by, contribution_lamports, contribution_cadence, category, enabled, created_at, completed_at",
    )
    .eq("owner_pubkey", owner)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, buckets: data ?? [] });
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
  const { data, error } = await sb
    .from("save_for_buckets")
    .insert({
      owner_pubkey: v.owner_pubkey,
      label: v.label,
      target_lamports: v.target_lamports,
      target_by: v.target_by ?? null,
      contribution_lamports: v.contribution_lamports ?? null,
      contribution_cadence: v.contribution_cadence ?? null,
      category: v.category,
      holding_card: v.holding_card ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, bucket: data });
}

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const v = parsed.data;
  const update: Record<string, unknown> = {};
  if (v.holding_card !== undefined) update.holding_card = v.holding_card;
  if (v.label !== undefined) update.label = v.label;
  if (v.enabled !== undefined) update.enabled = v.enabled;
  if (v.completed === true) update.completed_at = new Date().toISOString();
  if (v.completed === false) update.completed_at = null;

  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await sb
    .from("save_for_buckets")
    .update(update)
    .eq("bucket_id", v.bucket_id)
    .eq("owner_pubkey", v.owner_pubkey)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, bucket: data });
}

export async function DELETE(req: NextRequest) {
  let body: { bucket_id?: string; owner_pubkey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.bucket_id || !body.owner_pubkey) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { error } = await sb
    .from("save_for_buckets")
    .delete()
    .eq("bucket_id", body.bucket_id)
    .eq("owner_pubkey", body.owner_pubkey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
