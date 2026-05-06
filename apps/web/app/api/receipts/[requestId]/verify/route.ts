import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  verifyReceipt,
  type CanonicalPolicySnapshot,
  type CanonicalReason,
  type CanonicalReceipt,
} from "@settle/sdk";

export const runtime = "nodejs";

/**
 * GET /api/receipts/[requestId]/verify
 *
 * Pulls the receipt row from Supabase and recomputes the FULL canonical hash chain via
 * @settle/sdk verifyReceipt(). Returns ok=true only when every hash matches.
 *
 * Honest 4-of-4 verification requires `canonical_reason_json` and `canonical_policy_json`
 * to be present (added in migration 0006_canonical_persistence.sql; backfilled at insert
 * time by the x402 proxy).
 *
 * For receipts inserted before migration 0006, those columns are NULL → returns
 * `partial: true, verified: ["receipt_hash", "purpose_hash"]` honestly stating which
 * hashes could and could not be re-verified.
 */

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> },
) {
  try {
    return await handleVerify(req, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown verify error";
    return NextResponse.json(
      { ok: false, error: "verify_exception", message },
      { status: 500 },
    );
  }
}

async function handleVerify(
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
      "request_id, card_pubkey, pact_pubkey, merchant_pubkey, amount_lamports, capability_hash, purpose_text_hash, purpose_hash, receipt_hash, reason_hash, policy_snapshot_hash, canonical_reason_json, canonical_policy_json, decision_slot, policy_version, target_method, target_path",
    )
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "receipt_not_found", request_id: requestId }, { status: 404 });
  }

  const stripBytea = (v: unknown): string => {
    if (typeof v !== "string") return "";
    return v.startsWith("\\x") ? v.slice(2) : v;
  };

  const purposeTextHashHex = stripBytea(data.purpose_text_hash);
  const receiptHashHex = stripBytea(data.receipt_hash);
  const reasonHashHex = stripBytea(data.reason_hash);
  const policySnapshotHashHex = stripBytea(data.policy_snapshot_hash);
  const purposeHashHex = stripBytea(data.purpose_hash);
  const capabilityHashHex = stripBytea(data.capability_hash);

  const receipt: CanonicalReceipt = {
    request_id: data.request_id,
    card_pubkey: data.card_pubkey,
    pact_pubkey: data.pact_pubkey,
    merchant_pubkey: data.merchant_pubkey,
    amount_lamports: data.amount_lamports,
    capability_hash: capabilityHashHex,
    purpose_text_hash: purposeTextHashHex,
    decision_slot: data.decision_slot,
    policy_version: data.policy_version,
  };

  const targetMethod = data.target_method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

  const canonicalReason = data.canonical_reason_json as CanonicalReason | null;
  const canonicalPolicy = data.canonical_policy_json as CanonicalPolicySnapshot | null;

  // Full verification path — both canonical objects present.
  if (canonicalReason && canonicalPolicy) {
    const result = verifyReceipt({
      receipt,
      reason: canonicalReason,
      policy_snapshot: canonicalPolicy,
      http: { method: targetMethod, path: data.target_path },
      expected: {
        receipt_hash: receiptHashHex,
        reason_hash: reasonHashHex,
        policy_snapshot_hash: policySnapshotHashHex,
        purpose_hash: purposeHashHex,
      },
    });

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        partial: false,
        verified: ["receipt_hash", "reason_hash", "policy_snapshot_hash", "purpose_hash"],
        mismatches: [],
        request_id: requestId,
        message: "All 4 hashes match. Receipt is authentic.",
      });
    }
    return NextResponse.json({
      ok: false,
      partial: false,
      verified: ["receipt_hash", "reason_hash", "policy_snapshot_hash", "purpose_hash"].filter(
        (h) => !result.mismatches.includes(h),
      ),
      mismatches: result.mismatches,
      request_id: requestId,
      message: `Receipt FAILED verification: ${result.mismatches.join(", ")} mismatch.`,
    });
  }

  // Partial verification path — pre-migration 0006 receipts. We can verify receipt_hash
  // and purpose_hash honestly, but reason_hash + policy_snapshot_hash require the
  // canonical objects we don't have. Report this honestly to the caller.
  // We pass placeholder reason+policy that we EXPECT to mismatch, then surface that
  // honestly in the response.
  const placeholderReason: CanonicalReason = {
    decision: "ALLOW",
    deny_code: 0,
    cap_remaining_after: "0",
    per_call_max: "0",
    allowlist_match: true,
    capability_pinned: true,
    merchant_verified: true,
    expiry_slot: 0,
    current_slot: data.decision_slot,
  };
  const placeholderPolicy: CanonicalPolicySnapshot = {
    policy_version: data.policy_version,
    daily_cap: "0",
    per_call_max: "0",
    allowlist_count: 0,
    expiry_slot: 0,
    revoked: false,
  };

  const result = verifyReceipt({
    receipt,
    reason: placeholderReason,
    policy_snapshot: placeholderPolicy,
    http: { method: targetMethod, path: data.target_path },
    expected: {
      receipt_hash: receiptHashHex,
      reason_hash: reasonHashHex,
      policy_snapshot_hash: policySnapshotHashHex,
      purpose_hash: purposeHashHex,
    },
  });

  // Filter out reason_hash/policy_snapshot_hash mismatches since we KNOW they're stub-induced.
  const stubExpectedToMismatch = new Set(["reason_hash", "policy_snapshot_hash"]);
  const allMismatches = result.ok ? [] : result.mismatches;
  const realMismatches = allMismatches.filter((m: string) => !stubExpectedToMismatch.has(m));
  const verified = ["receipt_hash", "purpose_hash"].filter((h) => !allMismatches.includes(h));
  const ok = realMismatches.length === 0;

  return NextResponse.json({
    ok,
    partial: true,
    verified,
    mismatches: realMismatches,
    not_verifiable: ["reason_hash", "policy_snapshot_hash"],
    not_verifiable_reason:
      "canonical_reason_json + canonical_policy_json are NULL on this receipt (inserted before migration 0006). Receipts inserted after the migration verify all 4 hashes honestly.",
    request_id: requestId,
    message: ok
      ? "Partial verification: receipt_hash + purpose_hash match. reason/policy hashes not verifiable on this row."
      : `Partial verification FAILED: ${realMismatches.join(", ")} mismatch.`,
  });
}
