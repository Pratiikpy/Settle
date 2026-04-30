import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { authFromRequest } from "../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * F21 — Split-bill creation.
 *
 *   POST /api/split-bills
 *   body: { label, target_total_lamports, n_payers }
 *
 * Wallet-sig auth on POST — caller becomes the organizer (and the destination of
 * each payment). per_payer_lamports is computed server-side as
 *   ceil(target_total / n_payers)
 * so n equal payers cover the full target. The last payer absorbs any rounding (we
 * close the bill at n_payers paid; nothing prevents a payer from sending more, but
 * the page UI shows the exact per-payer share so it's not a footgun).
 */

const Body = z.object({
  label: z.string().min(1).max(80),
  target_total_lamports: z.string().regex(/^\d+$/),
  n_payers: z.number().int().min(2).max(50),
});

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: (e as Error).message },
      { status: 400 },
    );
  }

  const total = BigInt(body.target_total_lamports);
  const n = BigInt(body.n_payers);
  // Ceiling-divide so n payers always cover the target (no organizer left short).
  const perPayer = (total + n - 1n) / n;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await supabase
    .from("split_bills")
    .insert({
      organizer_pubkey: auth.pubkey,
      label: body.label,
      target_total_lamports: body.target_total_lamports,
      per_payer_lamports: perPayer.toString(),
      n_payers: body.n_payers,
    })
    .select("id, label, per_payer_lamports, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    label: data.label,
    per_payer_lamports: String(data.per_payer_lamports),
    organizer: auth.pubkey,
  });
}
