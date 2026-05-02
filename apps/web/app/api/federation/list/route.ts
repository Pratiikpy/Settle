import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F9.3 — List federated receipts addressed to a wallet.
 *
 *   GET /api/federation/list?pubkey=<wallet>&include_untrusted=false
 *
 * By default returns only `verified` rows (origin is trusted AND the
 * attestation sig matched at import time). Pass `include_untrusted=true`
 * to also see rows from untrusted origins — useful for the admin UI
 * that decides whether to promote an origin.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pubkey = url.searchParams.get("pubkey");
  const includeUntrusted = url.searchParams.get("include_untrusted") === "true";
  if (!pubkey || !PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  let q = sb
    .from("federated_receipts")
    .select(
      "federated_id, origin_id, remote_request_id, sender_pubkey, recipient_pubkey, amount_lamports, asset, status, imported_at",
    )
    .or(`sender_pubkey.eq.${pubkey},recipient_pubkey.eq.${pubkey}`);
  if (!includeUntrusted) q = q.eq("status", "verified");

  const { data, error } = await q.order("imported_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, receipts: data ?? [] });
}
