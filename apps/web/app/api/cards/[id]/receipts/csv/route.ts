import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/cards/[id]/receipts/csv
 *
 * Returns a CSV file of all receipts for the given card or pact.
 * Format: tax-software-friendly headers + ISO 8601 timestamps + plain decimal USDC.
 *
 * Columns:
 *   request_id, created_at, decision, deny_code, merchant_pubkey, amount_usdc,
 *   capability_hash, target_method, target_path, sig_solscan, decision_slot
 */

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function stripBytea(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.startsWith("\\x") ? v.slice(2) : v;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) {
    return NextResponse.json({ error: "invalid_card_id" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("receipts")
    .select(
      "request_id, created_at, decision, deny_code, merchant_pubkey, amount_lamports, capability_hash, target_method, target_path, sig_solscan, decision_slot",
    )
    .or(`card_pubkey.eq.${id},pact_pubkey.eq.${id}`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }

  const rows = data ?? [];
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const solscanBase = `https://solscan.io/tx/`;
  const solscanCluster = cluster === "mainnet" ? "" : `?cluster=${cluster}`;

  const headers = [
    "request_id",
    "created_at",
    "decision",
    "deny_code",
    "merchant_pubkey",
    "amount_usdc",
    "capability_hash",
    "target_method",
    "target_path",
    "decision_slot",
    "solscan_url",
  ];

  const lines = [headers.join(",")];
  for (const r of rows) {
    const amountUsdc = (Number(r.amount_lamports) / 1_000_000).toFixed(6);
    const solscan = r.sig_solscan ? `${solscanBase}${r.sig_solscan}${solscanCluster}` : "";
    lines.push(
      [
        csvEscape(r.request_id),
        csvEscape(r.created_at),
        csvEscape(r.decision),
        csvEscape(r.deny_code ?? ""),
        csvEscape(r.merchant_pubkey),
        csvEscape(amountUsdc),
        csvEscape(stripBytea(r.capability_hash)),
        csvEscape(r.target_method),
        csvEscape(r.target_path),
        csvEscape(r.decision_slot),
        csvEscape(solscan),
      ].join(","),
    );
  }

  const csv = lines.join("\n") + "\n";
  const filename = `settle-receipts-${id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
    },
  });
}
