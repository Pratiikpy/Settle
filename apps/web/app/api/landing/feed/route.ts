import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "../../../../lib/supabase-server";

export const runtime = "nodejs";
export const revalidate = 30;

/**
 * Magic-moment terminal feed — returns the last N real receipts for
 * the autoplay terminal on the landing page. Mix of ALLOW and DENY
 * so the terminal can show "rule allowed" + "rule blocked" + revoke.
 *
 * Never returns fake data — when there are no recent receipts we
 * return an empty array and the terminal hides itself.
 */
export interface FeedItem {
  request_id: string;
  decision: "ALLOW" | "DENY";
  deny_code: string | null;
  amount_usdc: number;
  merchant: string | null;
  sig: string | null;
  receipt_hash: string | null;
  created_at: string;
}

export async function GET(): Promise<Response> {
  let sb;
  try {
    sb = getSupabaseServiceClient();
  } catch {
    return NextResponse.json({ ok: true, items: [] as FeedItem[] });
  }

  // Last 8 ALLOW + last 4 DENY, merged by created_at descending.
  const [allows, denies] = await Promise.all([
    sb
      .from("receipts")
      .select(
        "request_id, decision, deny_code, amount_lamports, merchant_pubkey, sig_solscan, receipt_hash, created_at",
      )
      .eq("decision", "ALLOW")
      .order("created_at", { ascending: false })
      .limit(8),
    sb
      .from("receipts")
      .select(
        "request_id, decision, deny_code, amount_lamports, merchant_pubkey, sig_solscan, receipt_hash, created_at",
      )
      .eq("decision", "DENY")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const rows = [...(allows.data ?? []), ...(denies.data ?? [])];
  const items: FeedItem[] = rows
    .map((r) => ({
      request_id: String(r.request_id ?? ""),
      decision: (r.decision as "ALLOW" | "DENY") ?? "ALLOW",
      deny_code: (r.deny_code as string | null) ?? null,
      amount_usdc: Number(r.amount_lamports ?? 0) / 1e6,
      merchant: (r.merchant_pubkey as string | null) ?? null,
      sig: (r.sig_solscan as string | null) ?? null,
      receipt_hash: (r.receipt_hash as string | null) ?? null,
      created_at: String(r.created_at ?? ""),
    }))
    .filter((it) => it.request_id)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 12);

  return NextResponse.json(
    { ok: true, items },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    },
  );
}
