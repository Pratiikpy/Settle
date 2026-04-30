import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { authFromRequest } from "../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * Merchant pricelist CRUD. Wallet-sig auth on writes; public on reads (per RLS policy).
 *
 *   GET  /api/pricelist?merchant=<pubkey>           — list this merchant's slugs
 *   POST /api/pricelist                             — create or update a slug (auth = merchant)
 *   DELETE /api/pricelist?slug=<slug>               — soft-delete (set paused=true)
 *
 * The Solana Pay endpoint at /api/sp/[merchant]/[slug] reads from this same table.
 */

const Upsert = z.object({
  slug: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  label: z.string().min(1).max(80),
  amount_usdc: z.number().positive().max(10_000),
  description: z.string().max(280).optional(),
  paused: z.boolean().optional(),
});

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get("merchant");
  if (!merchant || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(merchant)) {
    return NextResponse.json({ error: "invalid_merchant" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await supabase
    .from("merchant_pricelist")
    .select("merchant_pubkey, slug, label, amount_usdc, description, paused, created_at, updated_at")
    .eq("merchant_pubkey", merchant)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  let parsed: z.infer<typeof Upsert>;
  try {
    parsed = Upsert.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: (e as Error).message },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("merchant_pricelist").upsert(
    {
      merchant_pubkey: auth.pubkey,
      slug: parsed.slug,
      label: parsed.label,
      amount_usdc: parsed.amount_usdc,
      description: parsed.description ?? null,
      paused: parsed.paused ?? false,
    },
    { onConflict: "merchant_pubkey,slug" },
  );
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, slug: parsed.slug });
}

export async function DELETE(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug || !/^[a-z0-9_-]{1,40}$/.test(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  // Soft-delete via paused flag — preserves history + analytics.
  const { error } = await supabase
    .from("merchant_pricelist")
    .update({ paused: true })
    .eq("merchant_pubkey", auth.pubkey)
    .eq("slug", slug);
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
