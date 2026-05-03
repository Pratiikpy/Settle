import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/handles/[handle]/badges
 *
 * Public list of soulbound reputation badges minted to this handle's
 * authority pubkey. The badge-cron worker is the only thing that writes
 * to the underlying table — this route is read-only.
 *
 * Returns earliest-first by earned_at? No — newest-first feels right
 * for a profile page where the most recent achievement is most exciting.
 *
 * No auth required; the catalogue itself is public.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }
  const normalized = handle.toLowerCase();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: handleRow, error: hErr } = await supabase
    .from("handles")
    .select("pubkey")
    .eq("handle", normalized)
    .maybeSingle();
  if (hErr) {
    return NextResponse.json({ error: "supabase_error", message: hErr.message }, { status: 502 });
  }
  if (!handleRow) {
    return NextResponse.json({ error: "handle_not_found" }, { status: 404 });
  }

  const { data: badges, error: badgesErr } = await supabase
    .from("reputation_badges")
    .select("badge_kind, asset_address, sig_solscan, earned_at")
    .eq("user_pubkey", handleRow.pubkey)
    .order("earned_at", { ascending: false });
  if (badgesErr) {
    console.warn("[handles/:handle/badges] badges query failed:", badgesErr.message);
  }

  return NextResponse.json({
    ok: true,
    pubkey: handleRow.pubkey,
    badges: badges ?? [],
  });
}
