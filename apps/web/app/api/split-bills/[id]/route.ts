import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/split-bills/[id] — public read of bill + payments. Powers the buyer page +
 * the live progress on /split-bill/[id] via Supabase Realtime.
 */

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const [{ data: bill }, { data: payments }] = await Promise.all([
    supabase
      .from("split_bills")
      .select(
        "id, organizer_pubkey, label, target_total_lamports, per_payer_lamports, n_payers, created_at, completed_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("split_bill_payments")
      .select("payer_pubkey, amount_lamports, sig_solscan, created_at")
      .eq("bill_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    bill: {
      ...bill,
      target_total_lamports: String(bill.target_total_lamports),
      per_payer_lamports: String(bill.per_payer_lamports),
    },
    payments: (payments ?? []).map((p) => ({
      payer_pubkey: p.payer_pubkey,
      amount_lamports: String(p.amount_lamports),
      sig_solscan: p.sig_solscan,
      created_at: p.created_at,
    })),
  });
}
