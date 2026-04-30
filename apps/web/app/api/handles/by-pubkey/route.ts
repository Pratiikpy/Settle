import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/handles/by-pubkey?pubkey=<base58>
 *
 * Returns the handle (if any) claimed by this pubkey. No auth required — handle directory
 * is public.
 */

export async function GET(req: NextRequest) {
  const pubkey = req.nextUrl.searchParams.get("pubkey");
  if (!pubkey || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: true, handle: null });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("handles")
    .select("handle, display_name, sns_domain, avatar_url, created_at")
    .eq("pubkey", pubkey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    pubkey,
    ...(data ?? { handle: null }),
  });
}
