import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/merchants/[handle]/disputes
 *
 * F4.6 — Merchant-side dispute inbox.
 *
 * Returns refund_requests where this merchant was the recipient. Lets a
 * merchant see what their customers are disputing, with the original
 * receipt + emoji + reason in one row.
 *
 * Public-read for now (refund_requests are tied to receipts which are
 * already on-chain). Future: gate by wallet signature so only the
 * merchant themselves can see; for now anyone with the handle can.
 */

interface DisputeRow {
  id: string;
  request_id: string;
  pact_pubkey: string | null;
  authority_pubkey: string;
  reason: string;
  emoji: string | null;
  created_at: string;
  // C90 — merchant resolution state.
  resolution_decision: "pending" | "approved_refund" | "denied";
  decided_at: string | null;
  refund_signature: string | null;
  merchant_response: string | null;
  // joined from receipts:
  amount_lamports: string | null;
  receipt_kind: string | null;
  receipt_decision: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Resolve handle → pubkey.
  const { data: handleRow } = await sb
    .from("handles")
    .select("pubkey")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (!handleRow) {
    return NextResponse.json(
      { error: "handle_not_found" },
      { status: 404 },
    );
  }
  const merchantPubkey = handleRow.pubkey as string;

  // 2. Pull receipts where the merchant is the recipient (last 30d).
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: receipts, error: rErr } = await sb
    .from("receipts")
    .select("request_id, amount_lamports, receipt_kind, decision")
    .eq("merchant_pubkey", merchantPubkey)
    .gte("created_at", thirtyAgo)
    .limit(5000);
  if (rErr) {
    return NextResponse.json(
      { error: "supabase_error", message: rErr.message },
      { status: 502 },
    );
  }
  const requestIds = (receipts ?? []).map((r) => r.request_id);
  if (requestIds.length === 0) {
    return NextResponse.json({ ok: true, count: 0, disputes: [] });
  }

  // 3. Pull refund_requests against any of those receipts. C90 added
  //    decision + decided_at + refund_signature + merchant_response.
  const { data: refunds, error: refErr } = await sb
    .from("refund_requests")
    .select(
      "id, request_id, pact_pubkey, authority_pubkey, reason, emoji, created_at, decision, decided_at, refund_signature, merchant_response",
    )
    .in("request_id", requestIds)
    .order("created_at", { ascending: false });
  if (refErr) {
    return NextResponse.json(
      { error: "supabase_error", message: refErr.message },
      { status: 502 },
    );
  }

  // 4. Join receipts onto refunds.
  const receiptMap = new Map<string, NonNullable<typeof receipts>[number]>();
  for (const r of receipts ?? []) receiptMap.set(r.request_id, r);

  const disputes: DisputeRow[] = (refunds ?? []).map((rf) => ({
    id: rf.id as string,
    request_id: rf.request_id as string,
    pact_pubkey: (rf.pact_pubkey as string | null) ?? null,
    authority_pubkey: rf.authority_pubkey as string,
    reason: (rf.reason as string) ?? "",
    emoji: (rf.emoji as string | null) ?? null,
    created_at: rf.created_at as string,
    resolution_decision:
      (rf.decision as DisputeRow["resolution_decision"]) ?? "pending",
    decided_at: (rf.decided_at as string | null) ?? null,
    refund_signature: (rf.refund_signature as string | null) ?? null,
    merchant_response: (rf.merchant_response as string | null) ?? null,
    amount_lamports:
      (receiptMap.get(rf.request_id as string)?.amount_lamports as string | null) ?? null,
    receipt_kind:
      (receiptMap.get(rf.request_id as string)?.receipt_kind as string | null) ?? null,
    receipt_decision:
      (receiptMap.get(rf.request_id as string)?.decision as string | null) ?? null,
  }));

  return NextResponse.json({
    ok: true,
    handle,
    merchant_pubkey: merchantPubkey,
    count: disputes.length,
    disputes,
  });
}
