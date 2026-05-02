import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F4.2 — Public merchant profile.
 *
 *   GET /api/merchants/[handle]/profile
 *
 * Returns aggregate trust + activity signals for a merchant handle. All
 * fields are public-safe — no card balances, no narration text, no
 * sealed-box ciphertext leaks. Numbers are bucketed (n_receipts is
 * exact; n_disputes is exact) so a casual viewer can judge whether to
 * pay this merchant without reading every receipt.
 *
 * Trust score formula:
 *   trust = 1 - (n_disputes_resolved_against_merchant / max(n_receipts, 1))
 *   clamped to [0, 1]; rounded to 2 decimals.
 *
 * This is a starter — the real trust score will eventually fold in age,
 * dispute resolution patterns, and verified-capability matches. Doing a
 * deterministic-but-naive formula now means the field exists from day
 * one and we can swap in something better behind the same shape.
 */

interface ProfileResponse {
  handle: string;
  display_name: string | null;
  pubkey: string;
  capability_verified: boolean;
  capability_alias: string | null;
  n_receipts: number;
  n_unique_payers: number;
  total_revenue_lamports: string;
  n_disputes: number;
  n_disputes_resolved_against: number;
  trust_score: number;
  joined_at: string;
  recent_receipts: Array<{
    request_id: string;
    amount_lamports: string;
    created_at: string;
    decision: string | null;
  }>;
  embed: {
    pay_button: string; // <settle-pay> tag, ready to copy-paste
    verify_button: string; // <settle-verify> tag
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle: handleRaw } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handleRaw)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }
  const handle = handleRaw.toLowerCase();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Resolve handle.
  const { data: handleRow } = await sb
    .from("handles")
    .select("handle, pubkey, display_name, created_at")
    .eq("handle", handle)
    .maybeSingle();
  if (!handleRow) {
    return NextResponse.json({ error: "handle_not_found" }, { status: 404 });
  }

  // 2. Capability registry alias (F5.x verified capabilities).
  const { data: capRow } = await sb
    .from("capability_registry")
    .select("alias, capability_hash")
    .eq("merchant_pubkey", handleRow.pubkey)
    .maybeSingle();

  // 3. Receipt aggregates. We aggregate in-process for now; once N
  //    crosses ~10K we'll move this to a materialized view.
  const { data: receipts } = await sb
    .from("receipts")
    .select("request_id, amount_lamports, created_at, decision, sender_pubkey")
    .eq("merchant_pubkey", handleRow.pubkey)
    .order("created_at", { ascending: false })
    .limit(500);

  const recList = receipts ?? [];
  const uniquePayers = new Set(recList.map((r) => r.sender_pubkey).filter(Boolean));
  const totalLamports = recList.reduce((acc, r) => acc + BigInt(r.amount_lamports || "0"), 0n);

  // 4. Dispute aggregates.
  const ids = recList.map((r) => r.request_id);
  let nDisputes = 0;
  let nResolvedAgainst = 0;
  if (ids.length > 0) {
    const { data: disputes } = await sb
      .from("refund_requests")
      .select("request_id, decision")
      .in("request_id", ids);
    if (disputes) {
      nDisputes = disputes.length;
      nResolvedAgainst = disputes.filter((d) => d.decision === "approved_refund").length;
    }
  }

  const trustScore = Math.max(
    0,
    Math.min(1, 1 - nResolvedAgainst / Math.max(recList.length, 1)),
  );

  const recent = recList.slice(0, 5).map((r) => ({
    request_id: r.request_id,
    amount_lamports: r.amount_lamports,
    created_at: r.created_at,
    decision: r.decision,
  }));

  const profile: ProfileResponse = {
    handle: handleRow.handle,
    display_name: handleRow.display_name,
    pubkey: handleRow.pubkey,
    capability_verified: capRow !== null && capRow !== undefined,
    capability_alias: capRow?.alias ?? null,
    n_receipts: recList.length,
    n_unique_payers: uniquePayers.size,
    total_revenue_lamports: totalLamports.toString(),
    n_disputes: nDisputes,
    n_disputes_resolved_against: nResolvedAgainst,
    trust_score: Math.round(trustScore * 100) / 100,
    joined_at: handleRow.created_at,
    recent_receipts: recent,
    embed: {
      pay_button: `<script src="https://settle.app/pay.js"></script>\n<settle-pay to="${handleRow.handle}" amount="1.00"></settle-pay>`,
      verify_button: `<script src="https://settle.app/verify.js"></script>\n<settle-verify request-id="REQUEST_ID_HERE"></settle-verify>`,
    },
  };

  return NextResponse.json({ ok: true, profile });
}
