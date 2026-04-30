import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sealedBoxDecrypt } from "../../../../../lib/sealed-box";
import { authFromRequest } from "../../../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * GET /api/receipts/[requestId]/decrypt
 *
 * Decrypts the off-chain encrypted_metadata column for a receipt.
 *
 * Auth required: caller must provide auth_pubkey + auth_sig + auth_nonce + auth_ts query
 * params. The signed pubkey must match the receipt's card.authority.
 *
 * 401 if unauthenticated. 403 if signed pubkey doesn't match card.authority.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }

  // 1. Verify wallet signature
  const auth = await authFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      {
        error: "auth_required",
        message:
          "Decrypt requires auth_pubkey + auth_sig + auth_nonce + auth_ts. Call /api/auth/challenge first.",
      },
      { status: 401 },
    );
  }
  if (!auth.ok) {
    return NextResponse.json(
      { error: "auth_invalid", reason: auth.reason },
      { status: 401 },
    );
  }

  // 2. Look up receipt + verify signed pubkey is the card.authority
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: receipt, error: rErr } = await supabase
    .from("receipts")
    .select("request_id, card_pubkey, encrypted_metadata")
    .eq("request_id", requestId)
    .maybeSingle();
  if (rErr) {
    return NextResponse.json({ error: "supabase_error", message: rErr.message }, { status: 502 });
  }
  if (!receipt) {
    return NextResponse.json({ error: "receipt_not_found" }, { status: 404 });
  }

  // 3. Verify the signed pubkey is the receipt's card.authority
  const { data: card, error: cErr } = await supabase
    .from("agent_cards")
    .select("authority_pubkey")
    .eq("card_pubkey", receipt.card_pubkey)
    .maybeSingle();
  if (cErr) {
    return NextResponse.json({ error: "supabase_error", message: cErr.message }, { status: 502 });
  }
  if (!card || card.authority_pubkey !== auth.pubkey) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "Signed pubkey does not match the receipt's card authority",
      },
      { status: 403 },
    );
  }

  if (!receipt.encrypted_metadata) {
    return NextResponse.json({ ok: true, encrypted: false, message: "no_metadata_encrypted" });
  }

  // 4. Decrypt
  try {
    const stripped =
      typeof receipt.encrypted_metadata === "string" &&
      receipt.encrypted_metadata.startsWith("\\x")
        ? receipt.encrypted_metadata.slice(2)
        : receipt.encrypted_metadata;
    const sealed = Buffer.from(stripped as string, "hex");
    const plaintext = sealedBoxDecrypt(sealed);
    return NextResponse.json({
      ok: true,
      encrypted: true,
      plaintext: JSON.parse(plaintext),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "decrypt_failed", message: (e as Error).message },
      { status: 500 },
    );
  }
}
