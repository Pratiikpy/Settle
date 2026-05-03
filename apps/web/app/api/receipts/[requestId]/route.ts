import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/receipts/[requestId]
 *
 * Public-safe receipt summary (used by the live receipt detail page).
 * Returns enough metadata to render the live receipt UI: hashes, amounts, target HTTP
 * route, decision, sig_solscan, plus pact info if any. Does NOT return encrypted_metadata
 * (use /decrypt with wallet auth) or canonical_*_json (use /verify).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
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
      "request_id, card_pubkey, pact_pubkey, merchant_pubkey, amount_lamports, decision, deny_code, capability_hash, purpose_text_hash, purpose_hash, receipt_hash, reason_hash, policy_snapshot_hash, target_method, target_path, sig_solscan, decision_slot, policy_version, public_feed, created_at, request_initiated_at, upstream_called_at, upstream_returned_at, compressed_sig, compressed_addr, receipt_kind, context_hash",
    )
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  if (!data) {
    return NextResponse.json({ error: "receipt_not_found", request_id: requestId }, { status: 404 });
  }

  // Strip Supabase \x prefix from bytea hex columns
  const strip = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    return v.startsWith("\\x") ? v.slice(2) : v;
  };

  // If pact_pubkey is set, fetch the pact mode metadata for live state.
  // v0.3: pact may be OneShot, Streaming, or DeliveryEscrow. The response carries
  // `mode` plus mode-appropriate fields. cap_lamports/spent stay populated for
  // oneshot back-compat.
  let pact:
    | {
        pubkey: string;
        mode: "oneshot";
        cap_lamports: string;
        spent: string;
        closed: boolean;
        expiry_slot: string;
        authority_pubkey: string;
      }
    | {
        pubkey: string;
        mode: "streaming";
        rate_lamports_per_slot: string;
        max_total_lamports: string;
        claimed: string;
        last_claim_slot: string;
        paused: boolean;
        closed: boolean;
        expiry_slot: string;
        authority_pubkey: string;
      }
    | {
        pubkey: string;
        mode: "delivery_escrow";
        amount_lamports: string;
        merchant_pubkey: string;
        capability_hash: string | null;
        confirm_deadline_slot: string;
        dispute_deadline_slot: string;
        released: boolean;
        refunded: boolean;
        closed: boolean;
        expiry_slot: string;
        authority_pubkey: string;
      }
    | null = null;
  if (data.pact_pubkey) {
    // Look up the pact and its parent card's authority (which is the buyer for
    // escrow + the spender for oneshot/streaming).
    const { data: pactRow, error: pactErr } = await supabase
      .from("pacts")
      .select(
        "pact_pubkey, mode, cap_lamports, spent, rate_lamports_per_slot, max_total_lamports, claimed, last_claim_slot, paused, escrow_amount, escrow_merchant_pubkey, escrow_capability_hash, confirm_deadline_slot, dispute_deadline_slot, released, refunded, closed, expiry_slot, parent_card",
      )
      .eq("pact_pubkey", data.pact_pubkey)
      .maybeSingle();
    if (pactErr) {
      console.warn(
        "[receipts/:id] pact lookup failed:",
        pactErr.message,
      );
    }
    if (pactRow) {
      // Parent card → authority pubkey for the EscrowState UI's buyer-vs-stranger check.
      let authorityPubkey: string = "";
      const { data: cardRow, error: cardErr } = await supabase
        .from("agent_cards")
        .select("authority_pubkey")
        .eq("card_pubkey", pactRow.parent_card)
        .maybeSingle();
      if (cardErr) {
        console.warn(
          "[receipts/:id] card lookup failed:",
          cardErr.message,
        );
      }
      authorityPubkey = (cardRow?.authority_pubkey as string | undefined) ?? "";

      const mode = (pactRow.mode ?? "oneshot") as
        | "oneshot"
        | "streaming"
        | "delivery_escrow";
      if (mode === "streaming") {
        pact = {
          pubkey: pactRow.pact_pubkey,
          mode: "streaming",
          rate_lamports_per_slot: String(pactRow.rate_lamports_per_slot ?? "0"),
          max_total_lamports: String(pactRow.max_total_lamports ?? "0"),
          claimed: String(pactRow.claimed ?? "0"),
          last_claim_slot: String(pactRow.last_claim_slot ?? "0"),
          paused: Boolean(pactRow.paused),
          closed: Boolean(pactRow.closed),
          expiry_slot: String(pactRow.expiry_slot),
          authority_pubkey: authorityPubkey,
        };
      } else if (mode === "delivery_escrow") {
        const capHashRaw = pactRow.escrow_capability_hash;
        let capabilityHash: string | null = null;
        if (capHashRaw) {
          // bytea round-trips as Buffer or hex string depending on Supabase driver.
          if (Buffer.isBuffer(capHashRaw)) {
            capabilityHash = capHashRaw.toString("hex");
          } else {
            const s = String(capHashRaw);
            capabilityHash = s.startsWith("\\x") ? s.slice(2) : s;
          }
        }
        pact = {
          pubkey: pactRow.pact_pubkey,
          mode: "delivery_escrow",
          amount_lamports: String(pactRow.escrow_amount ?? "0"),
          merchant_pubkey: String(pactRow.escrow_merchant_pubkey ?? ""),
          capability_hash: capabilityHash,
          confirm_deadline_slot: String(pactRow.confirm_deadline_slot ?? "0"),
          dispute_deadline_slot: String(pactRow.dispute_deadline_slot ?? "0"),
          released: Boolean(pactRow.released),
          refunded: Boolean(pactRow.refunded),
          closed: Boolean(pactRow.closed),
          expiry_slot: String(pactRow.expiry_slot),
          authority_pubkey: authorityPubkey,
        };
      } else {
        pact = {
          pubkey: pactRow.pact_pubkey,
          mode: "oneshot",
          cap_lamports: String(pactRow.cap_lamports ?? "0"),
          spent: String(pactRow.spent ?? "0"),
          closed: Boolean(pactRow.closed),
          expiry_slot: String(pactRow.expiry_slot),
          authority_pubkey: authorityPubkey,
        };
      }
    }
  }

  return NextResponse.json({
    ok: true,
    receipt: {
      request_id: data.request_id,
      card_pubkey: data.card_pubkey,
      pact_pubkey: data.pact_pubkey,
      merchant_pubkey: data.merchant_pubkey,
      amount_lamports: String(data.amount_lamports),
      decision: data.decision,
      deny_code: data.deny_code,
      capability_hash: strip(data.capability_hash),
      purpose_text_hash: strip(data.purpose_text_hash),
      purpose_hash: strip(data.purpose_hash),
      receipt_hash: strip(data.receipt_hash),
      reason_hash: strip(data.reason_hash),
      policy_snapshot_hash: strip(data.policy_snapshot_hash),
      target_method: data.target_method,
      target_path: data.target_path,
      sig_solscan: data.sig_solscan,
      decision_slot: data.decision_slot,
      policy_version: data.policy_version,
      public_feed: Boolean(data.public_feed),
      created_at: data.created_at,
      // P10 server-clock timing — populated by the proxy in the same process so
      // subtractions are clock-drift-safe. NULL on pre-P10 rows.
      request_initiated_at: data.request_initiated_at ?? null,
      upstream_called_at: data.upstream_called_at ?? null,
      upstream_returned_at: data.upstream_returned_at ?? null,
      // Computed (not persisted): pact-scoped receipts went through the x402 proxy
      // which submits via Helius Sender (Jito bundle) when HELIUS_API_KEY is set.
      // Direct sends are wallet-signed via sendRawTransaction. We don't claim to
      // have *verified* the network path — this is a best-effort label of the
      // submission strategy used, not a confirmed-via-Jito attestation.
      submission_method: data.pact_pubkey
        ? process.env.HELIUS_API_KEY
          ? "helius_sender_jito"
          : "rpc_fallback"
        : "wallet_send",
      // ZK Compression mirror — populated async by compress-cron, NULL until then.
      // The 4-hash on-chain commit on `sig_solscan` is the canonical proof; this
      // is a secondary, cheaper-to-store record indexed by Photon RPC.
      compressed_sig: (data.compressed_sig as string | null) ?? null,
      compressed_addr: (data.compressed_addr as string | null) ?? null,
      // F2.0 Universal Receipt Kernel — kind discriminator + context hash.
      // For pre-kernel rows (created before migration 0019) the kind defaults
      // to 'x402_spend' via the migration backfill. context_hash is null on
      // pre-kernel rows; new rows always populate it.
      receipt_kind: (data.receipt_kind as string | null) ?? "x402_spend",
      context_hash: strip(data.context_hash),
    },
    pact,
  }, {
    // Public receipts are effectively immutable (decision + hashes never
    // change after on-chain commit). Tags/narration mutate but lag of
    // ≤60s is fine for the poster surface — authed /receipts/[id]
    // detail view fetches fresh client-side anyway.
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
