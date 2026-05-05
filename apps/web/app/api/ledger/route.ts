import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unified ledger — all of a wallet's "money flow" across provenance layers.
 *
 *   GET /api/ledger?wallet=<pubkey>&include_untrusted=false
 *
 * Returns four buckets, each ordered by time:
 *   - native_kernel:      receipts where import_source IS NULL (Settle-originated,
 *                         full 4-hash kernel commit + on-chain anchor)
 *   - native_imported:    receipts where import_source IS NOT NULL (Solana Pay
 *                         or similar mirrored into Settle, kernel computed but
 *                         not Settle-originated)
 *   - federated_trusted:  federated_receipts where status='verified' (foreign
 *                         origin's attestation matched + origin is trusted)
 *   - federated_untrusted: federated_receipts where status='untrusted' (sig
 *                         matched but admin hasn't promoted the origin yet)
 *
 * Why four buckets and not one: receipts at different provenance levels
 * carry different guarantees, and lumping them in one list teaches the
 * user a lie. A native_kernel row has 4-hash + on-chain anchor; a
 * federated_untrusted row is "someone signed for it but we haven't
 * vetted the origin." Honest UX says: show me the trust gradient, let
 * me filter, don't pretend they're equivalent.
 *
 * The `include_untrusted` param defaults to false so the casual user
 * doesn't see attestations from origins the operator hasn't promoted.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface LedgerEntry {
  source:
    | "native_kernel"
    | "native_imported"
    | "federated_trusted"
    | "federated_untrusted";
  request_id: string;
  amount_lamports: string;
  asset: string;
  sender_pubkey: string | null;
  recipient_pubkey: string | null;
  occurred_at: string;
  // Provenance-specific:
  receipt_kind?: string | null;
  decision?: string | null;
  import_source?: string | null;
  origin_id?: string | null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet");
  const includeUntrusted = url.searchParams.get("include_untrusted") === "true";
  if (!wallet || !PUBKEY_RE.test(wallet)) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
  }
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  // ─── 1. Native receipts (kernel + imported in same table) ───
  // Schema reality: `receipts` has card_pubkey (sender for direct_send;
  // funding card for x402_spend) and merchant_pubkey (recipient). It has
  // NO separate sender_pubkey / recipient_pubkey columns. The earlier
  // version of this filter referenced columns that don't exist, which
  // made the query 400 → fall through to `data = null` → ledger always
  // empty. That was the silent-failure half of "Bug #10" — even after
  // we started inserting receipt rows, this query couldn't read them.
  const { data: receipts, error: receiptsErr } = await sb
    .from("receipts")
    .select(
      "request_id, receipt_kind, amount_lamports, card_pubkey, merchant_pubkey, decision, import_source, created_at, imported_at",
    )
    .or(`card_pubkey.eq.${wallet},merchant_pubkey.eq.${wallet}`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (receiptsErr) {
    return NextResponse.json(
      { error: "receipts_query_failed", message: receiptsErr.message },
      { status: 502 },
    );
  }

  const nativeKernel: LedgerEntry[] = [];
  const nativeImported: LedgerEntry[] = [];
  for (const r of receipts ?? []) {
    const entry: LedgerEntry = {
      source: r.import_source ? "native_imported" : "native_kernel",
      request_id: r.request_id,
      amount_lamports: r.amount_lamports,
      asset: "USDC",
      sender_pubkey: r.card_pubkey,
      recipient_pubkey: r.merchant_pubkey,
      occurred_at: r.imported_at ?? r.created_at,
      receipt_kind: r.receipt_kind,
      decision: r.decision,
      import_source: r.import_source,
    };
    if (r.import_source) nativeImported.push(entry);
    else nativeKernel.push(entry);
  }

  // ─── 2. Federated receipts ───
  const { data: federated } = await sb
    .from("federated_receipts")
    .select(
      "federated_id, origin_id, remote_request_id, sender_pubkey, recipient_pubkey, amount_lamports, asset, status, imported_at",
    )
    .or(`sender_pubkey.eq.${wallet},recipient_pubkey.eq.${wallet}`)
    .order("imported_at", { ascending: false })
    .limit(100);

  const federatedTrusted: LedgerEntry[] = [];
  const federatedUntrusted: LedgerEntry[] = [];
  for (const f of federated ?? []) {
    if (f.status === "invalid") continue;
    const entry: LedgerEntry = {
      source: f.status === "verified" ? "federated_trusted" : "federated_untrusted",
      request_id: f.federated_id,
      amount_lamports: f.amount_lamports?.toString() ?? "0",
      asset: f.asset ?? "USDC",
      sender_pubkey: f.sender_pubkey,
      recipient_pubkey: f.recipient_pubkey,
      occurred_at: f.imported_at,
      origin_id: f.origin_id,
    };
    if (f.status === "verified") federatedTrusted.push(entry);
    else if (includeUntrusted) federatedUntrusted.push(entry);
  }

  return NextResponse.json({
    ok: true,
    wallet,
    counts: {
      native_kernel: nativeKernel.length,
      native_imported: nativeImported.length,
      federated_trusted: federatedTrusted.length,
      federated_untrusted: federatedUntrusted.length,
    },
    native_kernel: nativeKernel,
    native_imported: nativeImported,
    federated_trusted: federatedTrusted,
    federated_untrusted: federatedUntrusted,
  });
}
