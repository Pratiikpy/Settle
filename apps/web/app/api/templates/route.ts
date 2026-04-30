import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authFromRequest } from "../../../lib/wallet-auth";

export const runtime = "nodejs";

const NewTemplate = z.object({
  slug: z.string().regex(/^[a-z0-9_-]{2,40}$/, "slug must be 2-40 lowercase alnum/dash/underscore"),
  title: z.string().min(2).max(80),
  description: z.string().min(10).max(500),
  cap_usdc: z.number().positive().max(10_000),
  expiry_minutes: z.number().int().min(1).max(10_080),
  merchant_allowlist: z.array(z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)).max(20),
  default_purpose: z.string().max(280).optional(),
  icon_emoji: z.string().max(8).optional(),
});

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * GET /api/templates — list templates.
 * Query params:
 *   featured=1   → only featured
 *   author=<pk>  → only this author's
 *   limit=N
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: true, templates: [] });
  }

  const featured = req.nextUrl.searchParams.get("featured");
  const author = req.nextUrl.searchParams.get("author");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);

  let q = supabase
    .from("agent_templates")
    .select(
      "slug, title, description, author_pubkey, cap_usdc, expiry_minutes, merchant_allowlist, default_purpose, icon_emoji, use_count, featured, created_at",
    )
    .order("featured", { ascending: false })
    .order("use_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (featured === "1") q = q.eq("featured", true);
  if (author) q = q.eq("author_pubkey", author);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, templates: data ?? [] });
}

/**
 * POST /api/templates — create or update (author-owned upsert).
 * Wallet-sig auth required. Author = signer.
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }

  let parsed: z.infer<typeof NewTemplate>;
  try {
    parsed = NewTemplate.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid_body", message: (e as Error).message }, { status: 400 });
  }

  // Ownership: if a template with this slug exists, only the original author can update.
  const { data: existing } = await supabase
    .from("agent_templates")
    .select("author_pubkey")
    .eq("slug", parsed.slug)
    .maybeSingle();

  if (existing && existing.author_pubkey !== auth.pubkey) {
    return NextResponse.json({ error: "slug_taken", message: "Slug is taken." }, { status: 409 });
  }

  const row = {
    slug: parsed.slug,
    title: parsed.title,
    description: parsed.description,
    author_pubkey: auth.pubkey,
    cap_usdc: parsed.cap_usdc,
    expiry_minutes: parsed.expiry_minutes,
    merchant_allowlist: parsed.merchant_allowlist,
    default_purpose: parsed.default_purpose ?? "",
    icon_emoji: parsed.icon_emoji ?? "AI",
  };

  const { error } = await supabase
    .from("agent_templates")
    .upsert(row, { onConflict: "slug" });

  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, slug: parsed.slug });
}
