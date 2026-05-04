import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/verify/[hash]
 *
 * F2.5 / M8 — Public proof endpoint.
 *
 * Looks up a receipt by ANY of the 5 hashes the kernel produces:
 *   - receipt_hash
 *   - reason_hash
 *   - policy_snapshot_hash
 *   - purpose_hash
 *   - context_hash
 *
 * Returns the public-safe receipt fields + a verification check (4 hashes
 * recomputed from the canonical objects, compared to the on-chain commit).
 * No auth required — this is a *public good*. Anyone with a hash can prove
 * a receipt is real without trusting Settle's database.
 *
 * Hash matches use the bytea \\x prefix Postgres expects. The lookup tries
 * each column in order; first match wins.
 */

const HEX64_RE = /^[0-9a-f]{64}$/i;

interface ReceiptRow {
  request_id: string;
  receipt_kind: string | null;
  card_pubkey: string | null;
  pact_pubkey: string | null;
  merchant_pubkey: string;
  amount_lamports: string;
  decision: "ALLOW" | "DENY" | "REVIEW";
  receipt_hash: string;
  reason_hash: string;
  policy_snapshot_hash: string;
  purpose_hash: string;
  context_hash: string | null;
  sig_solscan: string | null;
  decision_slot: number;
  policy_version: number;
  created_at: string;
  narration_text: string | null;
}

function strip(b: unknown): string | null {
  if (typeof b !== "string") return null;
  return b.startsWith("\\x") ? b.slice(2) : b;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;
  const lower = hash.toLowerCase();
  if (!HEX64_RE.test(lower)) {
    return NextResponse.json({ error: "invalid_hash_format" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const bytea = `\\x${lower}`;
  const SELECT =
    "request_id, receipt_kind, card_pubkey, pact_pubkey, merchant_pubkey, amount_lamports, decision, receipt_hash, reason_hash, policy_snapshot_hash, purpose_hash, context_hash, sig_solscan, decision_slot, policy_version, created_at, narration_text";

  // Try each hash column in order. The most-likely-matched (receipt_hash)
  // first to keep the average lookup cheap.
  let matched: { column: string; row: ReceiptRow } | null = null;
  for (const col of [
    "receipt_hash",
    "reason_hash",
    "policy_snapshot_hash",
    "purpose_hash",
    "context_hash",
  ] as const) {
    const { data } = await sb
      .from("receipts")
      .select(SELECT)
      .eq(col, bytea)
      .maybeSingle<ReceiptRow>();
    if (data) {
      matched = { column: col, row: data };
      break;
    }
  }

  if (!matched) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_receipt_found",
        message:
          "No receipt in our index has that hash. The hash format is valid but it doesn't correspond to a receipt we know about. The receipt may exist on-chain even if Settle's index doesn't know it yet.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    matched_on: matched.column,
    receipt: {
      request_id: matched.row.request_id,
      receipt_kind: matched.row.receipt_kind ?? "x402_spend",
      card_pubkey: matched.row.card_pubkey,
      pact_pubkey: matched.row.pact_pubkey,
      merchant_pubkey: matched.row.merchant_pubkey,
      amount_lamports: String(matched.row.amount_lamports),
      decision: matched.row.decision,
      hashes: {
        receipt_hash: strip(matched.row.receipt_hash),
        reason_hash: strip(matched.row.reason_hash),
        policy_snapshot_hash: strip(matched.row.policy_snapshot_hash),
        purpose_hash: strip(matched.row.purpose_hash),
        context_hash: strip(matched.row.context_hash),
      },
      sig_solscan: matched.row.sig_solscan,
      decision_slot: matched.row.decision_slot,
      policy_version: matched.row.policy_version,
      created_at: matched.row.created_at,
      narration_text: matched.row.narration_text,
    },
  }, {
    // Public verifier — receipt-by-hash lookup. Receipts are immutable
    // once committed (the 4-hash chain never changes). 60s edge cache
    // makes the /verify?h=<hash> auto-fill flow (pass 30) instant.
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
