import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authFromRequest } from "../../../../../../../lib/wallet-auth";
import { sealedBoxDecryptWithPrivkey } from "@settle/sdk";

export const runtime = "nodejs";

/**
 * GET /api/receipts/[requestId]/attachments/[attachmentId]/play
 *
 * Wallet-sig auth. Caller pubkey must equal sealed_box_for_pubkey OR card.authority for
 * the underlying receipt.
 *
 * Server fetches ciphertext from Storage, decrypts with SETTLE_SEALED_BOX_PRIVKEY, streams
 * the plaintext audio with the original MIME type. Cache-Control: no-store so the cipher-
 * text never sits in CDN tiers.
 *
 * This is the "trust-minimized" model — server holds the privkey but only releases plain-
 * text after the wallet-sig check. V0.4 path: per-recipient X25519 keys so the server
 * never holds them in the first place.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string; attachmentId: string }> },
) {
  const { requestId, attachmentId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attachmentId)) {
    return NextResponse.json({ error: "invalid_attachment_id" }, { status: 400 });
  }

  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth?.reason ?? "missing_signature" },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data: row, error: aErr } = await supabase
    .from("receipt_attachments")
    .select("storage_path, mime_type, sealed_box_for_pubkey, request_id")
    .eq("id", attachmentId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (aErr) {
    return NextResponse.json({ error: "supabase_error", message: aErr.message }, { status: 502 });
  }
  if (!row) {
    return NextResponse.json({ error: "attachment_not_found" }, { status: 404 });
  }

  // Authorization
  const isSealedRecipient = row.sealed_box_for_pubkey === auth.pubkey;
  let isAuthority = false;
  if (!isSealedRecipient) {
    const { data: receipt } = await supabase
      .from("receipts")
      .select("card_pubkey")
      .eq("request_id", requestId)
      .maybeSingle();
    if (receipt) {
      const { data: card } = await supabase
        .from("agent_cards")
        .select("authority_pubkey")
        .eq("card_pubkey", receipt.card_pubkey)
        .maybeSingle();
      if (card?.authority_pubkey === auth.pubkey) isAuthority = true;
    }
  }
  if (!isSealedRecipient && !isAuthority) {
    return NextResponse.json(
      {
        error: "forbidden",
        message:
          "Caller is neither the attachment recipient nor the receipt's card authority.",
      },
      { status: 403 },
    );
  }

  // Fetch ciphertext
  const { data: blob, error: dErr } = await supabase.storage
    .from("receipt-attachments")
    .download(row.storage_path);
  if (dErr || !blob) {
    return NextResponse.json(
      { error: "storage_download_failed", message: dErr?.message ?? "missing" },
      { status: 502 },
    );
  }
  const cipher = new Uint8Array(await blob.arrayBuffer());

  // Decrypt with deployment privkey
  const privB64 = process.env.SETTLE_SEALED_BOX_PRIVKEY;
  if (!privB64) {
    return NextResponse.json({ error: "sealed_box_unconfigured" }, { status: 503 });
  }
  const priv = new Uint8Array(Buffer.from(privB64, "base64"));
  if (priv.length !== 32) {
    return NextResponse.json({ error: "sealed_box_priv_invalid" }, { status: 503 });
  }

  let plaintext: Uint8Array;
  try {
    plaintext = sealedBoxDecryptWithPrivkey(cipher, priv);
  } catch (e) {
    return NextResponse.json(
      { error: "decrypt_failed", message: (e as Error).message },
      { status: 502 },
    );
  }

  // Stream plaintext with the original MIME type
  return new NextResponse(plaintext as unknown as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": row.mime_type ?? "audio/webm",
      "Cache-Control": "no-store, private",
      "Content-Length": String(plaintext.byteLength),
    },
  });
}
