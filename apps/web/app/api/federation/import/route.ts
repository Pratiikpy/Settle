import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F9.3 — Federation import endpoint.
 *
 *   POST /api/federation/import
 *     {
 *       origin_id, remote_request_id, payload, attestation_sig_b58
 *     }
 *
 * Verifies the foreign origin's attestation over
 *   sha256(canonical_json(payload)) || origin_id || remote_request_id
 * using the registered attestation_pubkey, then upserts a
 * federated_receipts row.
 *
 * Idempotent on (origin_id, remote_request_id) — re-imports overwrite
 * the row with the latest payload but never duplicate. The status
 * starts as `verified` if the sig matches AND the origin is `trusted`,
 * `untrusted` if sig matches but origin is not yet trusted, `invalid`
 * if the sig fails (and the row is rejected, not stored).
 */

const Body = z.object({
  origin_id: z.string().min(1).max(80),
  remote_request_id: z.string().min(1).max(120),
  payload: z.record(z.unknown()),
  attestation_sig_b58: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{86,90}$/),
});

/**
 * Canonical JSON serialization — sorted keys, no whitespace. Same
 * algorithm as packages/sdk/src/canonical.ts so foreign systems can
 * reproduce our hash byte-for-byte.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Look up origin record.
  const { data: origin } = await sb
    .from("federation_origins")
    .select("origin_id, attestation_pubkey, trusted")
    .eq("origin_id", v.origin_id)
    .maybeSingle();
  if (!origin) {
    return NextResponse.json({ error: "unknown_origin" }, { status: 404 });
  }

  // 2. Compute payload hash.
  const canonicalStr = canonical(v.payload);
  const payloadHash = bytesToHex(sha256(new TextEncoder().encode(canonicalStr)));

  // 3. Verify attestation: sig over (payloadHash || origin_id || remote_request_id).
  const messageStr = `${payloadHash}|${v.origin_id}|${v.remote_request_id}`;
  let sigOk = false;
  try {
    sigOk = ed25519.verify(
      bs58.decode(v.attestation_sig_b58),
      new TextEncoder().encode(messageStr),
      bs58.decode(origin.attestation_pubkey),
    );
  } catch {
    sigOk = false;
  }

  if (!sigOk) {
    return NextResponse.json({ error: "bad_attestation" }, { status: 401 });
  }

  // 4. Lift recognized fields from payload (best-effort — payload shape
  //    is foreign, so we tolerate missing keys).
  const p = v.payload as Record<string, unknown>;
  const sender_pubkey =
    typeof p.sender_pubkey === "string" ? p.sender_pubkey : (p.from as string | undefined) ?? null;
  const recipient_pubkey =
    typeof p.recipient_pubkey === "string"
      ? p.recipient_pubkey
      : (p.to as string | undefined) ?? null;
  const amount_lamports =
    typeof p.amount_lamports === "string" || typeof p.amount_lamports === "number"
      ? String(p.amount_lamports)
      : null;
  const asset = typeof p.asset === "string" ? p.asset : "USDC";

  const status = origin.trusted ? "verified" : "untrusted";

  const { data: row, error } = await sb
    .from("federated_receipts")
    .upsert(
      {
        origin_id: v.origin_id,
        remote_request_id: v.remote_request_id,
        sender_pubkey,
        recipient_pubkey,
        amount_lamports,
        asset,
        raw_payload: v.payload,
        payload_hash: payloadHash,
        attestation_sig_b58: v.attestation_sig_b58,
        status,
      },
      { onConflict: "origin_id,remote_request_id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    federated_receipt: row,
    payload_hash: payloadHash,
    trusted: origin.trusted,
  });
}
