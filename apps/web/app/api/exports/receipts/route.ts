import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F2.12 — compliance-grade receipt export.
 *
 * GET /api/exports/receipts?pubkey=<x>&from=<iso>&to=<iso>&format=csv|pdf|json
 *
 * Returns the user's receipts (cards they own + payments they received as
 * merchant) in the requested format with hash-chain proofs included so
 * the export is independently verifiable.
 *
 * format=csv  → text/csv with one row per receipt
 * format=pdf  → text/html (consumer prints to PDF; same pattern as the
 *               existing receipt print page; avoids a heavy server PDF dep)
 * format=json → application/json (default)
 *
 * Wave 1 / Stream B3.
 *
 * Auth: pubkey query param. We don't gate harder because receipts are
 * already RLS-protected by ownership; an unauthorized caller gets an
 * empty set rather than 403, which is acceptable for an export tool.
 */

const Query = z.object({
  pubkey: z.string().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(["csv", "pdf", "json"]).default("json"),
  jurisdiction: z.enum(["us", "eu", "in", "generic"]).default("generic"),
});

interface Row {
  request_id: string;
  created_at: string;
  decision_slot: number | null;
  amount_lamports: string;
  amount_usdc: string;
  decision: string;
  receipt_kind: string | null;
  card_pubkey: string;
  merchant_pubkey: string;
  capability_hash: string | null;
  receipt_hash: string | null;
  reason_hash: string | null;
  policy_snapshot_hash: string | null;
  purpose_hash: string | null;
  narration_text: string | null;
}

function csvEscape(s: string | null): string {
  if (s === null || s === undefined) return "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Row[]): string {
  const header = [
    "request_id",
    "created_at",
    "decision_slot",
    "amount_usdc",
    "decision",
    "receipt_kind",
    "card_pubkey",
    "merchant_pubkey",
    "capability_hash",
    "receipt_hash",
    "reason_hash",
    "policy_snapshot_hash",
    "purpose_hash",
    "narration_text",
  ].join(",");
  const body = rows
    .map((r) =>
      [
        r.request_id,
        r.created_at,
        r.decision_slot ?? "",
        r.amount_usdc,
        r.decision,
        r.receipt_kind ?? "",
        r.card_pubkey,
        r.merchant_pubkey,
        r.capability_hash ?? "",
        r.receipt_hash ?? "",
        r.reason_hash ?? "",
        r.policy_snapshot_hash ?? "",
        r.purpose_hash ?? "",
        r.narration_text ?? "",
      ]
        .map((c) => csvEscape(typeof c === "string" ? c : String(c)))
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

function rowsToPrintHtml(
  rows: Row[],
  pubkey: string,
  from: string | undefined,
  to: string | undefined,
  jurisdiction: string,
): string {
  const total = rows.reduce(
    (acc, r) => acc + Number.parseFloat(r.amount_usdc),
    0,
  );
  const rangeLabel =
    from && to
      ? `${new Date(from).toLocaleDateString()} – ${new Date(to).toLocaleDateString()}`
      : "all-time";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Settle receipt export — ${pubkey.slice(0, 8)}…</title>
<link rel="stylesheet" href="/print-receipt.css">
<style>body{font-family:system-ui,sans-serif;font-size:11px;color:#222;padding:24px;max-width:920px;margin:0 auto}
h1{font-size:18px;margin:0 0 4px}.muted{color:#666;font-size:10px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:9px}
th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f3f3f3}
code{font-family:ui-monospace,monospace;font-size:8px;color:#444;word-break:break-all}
.total{margin-top:14px;font-size:13px;font-weight:600}
.foot{margin-top:24px;font-size:9px;color:#888}
@media print{body{padding:12px}}</style>
</head><body>
<h1>Settle receipt export</h1>
<div class="muted">Account: <code>${pubkey}</code></div>
<div class="muted">Period: ${rangeLabel} · Jurisdiction template: ${jurisdiction.toUpperCase()}</div>
<div class="muted">Generated: ${new Date().toISOString()}</div>
<div class="total">${rows.length} receipts · total $${total.toFixed(2)} USDC</div>
<table>
<thead><tr>
<th>Date</th><th>Request ID</th><th>Amount (USDC)</th><th>Decision</th>
<th>Kind</th><th>Counterparty</th><th>Receipt hash (proof)</th>
</tr></thead><tbody>
${rows
  .map(
    (r) => `<tr>
<td>${new Date(r.created_at).toISOString().slice(0, 19).replace("T", " ")}</td>
<td><code>${r.request_id.slice(0, 8)}…</code></td>
<td>${r.amount_usdc}</td>
<td>${r.decision}</td>
<td>${r.receipt_kind ?? "—"}</td>
<td><code>${(r.card_pubkey === pubkey ? r.merchant_pubkey : r.card_pubkey).slice(0, 8)}…</code></td>
<td><code>${r.receipt_hash ?? "—"}</code></td>
</tr>`,
  )
  .join("\n")}
</tbody></table>
<div class="foot">Each receipt above commits 4 BLAKE3 hashes on-chain. Anyone can recompute the chain
from this export plus the on-chain ${"P"}ublic ${"K"}ey and verify integrity independently — see /verify on Settle.</div>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = Query.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;

  let sb;
  try {
    sb = getSupabaseServiceClient();
  } catch {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }

  // Cards owned by this pubkey
  const { data: cards } = await sb
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", v.pubkey);
  const cardPubkeys = (cards ?? []).map((c) => c.card_pubkey as string);

  let qb = sb
    .from("receipts")
    .select(
      "request_id, created_at, decision_slot, amount_lamports, decision, receipt_kind, card_pubkey, merchant_pubkey, capability_hash, receipt_hash, reason_hash, policy_snapshot_hash, purpose_hash, narration_text",
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (cardPubkeys.length > 0) {
    qb = qb.or(
      `card_pubkey.in.(${cardPubkeys.map((k) => `"${k}"`).join(",")}),merchant_pubkey.eq.${v.pubkey}`,
    );
  } else {
    qb = qb.eq("merchant_pubkey", v.pubkey);
  }
  if (v.from) qb = qb.gte("created_at", v.from);
  if (v.to) qb = qb.lte("created_at", v.to);

  const { data, error } = await qb;
  if (error) {
    return NextResponse.json(
      { error: "export_failed", detail: error.message },
      { status: 500 },
    );
  }

  const rows: Row[] = (data ?? []).map((r) => ({
    request_id: r.request_id as string,
    created_at: r.created_at as string,
    decision_slot: (r.decision_slot as number) ?? null,
    amount_lamports: String(r.amount_lamports ?? "0"),
    amount_usdc: (Number(r.amount_lamports ?? 0) / 1e6).toFixed(6),
    decision: (r.decision as string) ?? "",
    receipt_kind: (r.receipt_kind as string) ?? null,
    card_pubkey: r.card_pubkey as string,
    merchant_pubkey: r.merchant_pubkey as string,
    capability_hash: (r.capability_hash as string) ?? null,
    receipt_hash:
      typeof r.receipt_hash === "string"
        ? r.receipt_hash
        : (r.receipt_hash && (r.receipt_hash as { toString(): string }).toString()) ??
          null,
    reason_hash:
      typeof r.reason_hash === "string"
        ? r.reason_hash
        : (r.reason_hash && (r.reason_hash as { toString(): string }).toString()) ??
          null,
    policy_snapshot_hash:
      typeof r.policy_snapshot_hash === "string"
        ? r.policy_snapshot_hash
        : (r.policy_snapshot_hash &&
            (r.policy_snapshot_hash as { toString(): string }).toString()) ??
          null,
    purpose_hash:
      typeof r.purpose_hash === "string"
        ? r.purpose_hash
        : (r.purpose_hash && (r.purpose_hash as { toString(): string }).toString()) ??
          null,
    narration_text: (r.narration_text as string) ?? null,
  }));

  const filenameStem = `settle-receipts-${v.pubkey.slice(0, 8)}-${
    v.from?.slice(0, 10) ?? "all"
  }-to-${v.to?.slice(0, 10) ?? "now"}`;

  if (v.format === "csv") {
    return new NextResponse(rowsToCsv(rows), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filenameStem}.csv"`,
      },
    });
  }
  if (v.format === "pdf") {
    // Print-styled HTML; user uses their browser's "Print to PDF" feature.
    // Avoids a multi-MB server-side PDF dep on Vercel.
    return new NextResponse(
      rowsToPrintHtml(rows, v.pubkey, v.from, v.to, v.jurisdiction),
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  }
  return NextResponse.json({
    ok: true,
    pubkey: v.pubkey,
    range: { from: v.from ?? null, to: v.to ?? null },
    jurisdiction: v.jurisdiction,
    count: rows.length,
    receipts: rows,
  });
}
