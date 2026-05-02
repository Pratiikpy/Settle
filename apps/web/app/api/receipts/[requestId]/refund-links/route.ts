import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/receipts/[requestId]/refund-links
 *
 * Returns the refund relationship for this receipt:
 *   - `original`: if THIS receipt is a refund, the request_id + amount
 *     of the original receipt being refunded.
 *   - `refunds`: if there are receipts whose `refund_of_request_id`
 *     points HERE, the list of those refund receipts.
 *
 * Either or both can be empty. The receipt page consumes this to
 * render bidirectional links so a user can navigate from refund →
 * original or original → its refunds without leaving the receipt UI.
 *
 * Public read — same surface as /api/receipts/[id]; refund linkage is
 * just metadata, not sealed.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LinkedReceipt {
  request_id: string;
  amount_lamports: string;
  receipt_kind: string | null;
  decision: string | null;
  created_at: string;
  sig_solscan: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!UUID_RE.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Look up THIS receipt to see if it's a refund pointing somewhere.
  const { data: self } = await sb
    .from("receipts")
    .select("refund_of_request_id, receipt_kind")
    .eq("request_id", requestId)
    .maybeSingle();

  let original: LinkedReceipt | null = null;
  if (self?.refund_of_request_id) {
    const { data: orig } = await sb
      .from("receipts")
      .select(
        "request_id, amount_lamports, receipt_kind, decision, created_at, sig_solscan",
      )
      .eq("request_id", self.refund_of_request_id)
      .maybeSingle<LinkedReceipt>();
    original = orig ?? null;
  }

  // 2. Find receipts whose refund_of_request_id == this requestId.
  const { data: refunds } = await sb
    .from("receipts")
    .select(
      "request_id, amount_lamports, receipt_kind, decision, created_at, sig_solscan",
    )
    .eq("refund_of_request_id", requestId)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    ok: true,
    request_id: requestId,
    is_refund: !!self?.refund_of_request_id,
    original,
    refunds: (refunds as LinkedReceipt[] | null) ?? [],
  });
}
