import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authFromRequest } from "../../../../../lib/wallet-auth";
import { sendPushToPubkey } from "../../../../../lib/web-push";

export const runtime = "nodejs";
// Allow ciphertext up to 512KB (matches storage bucket cap)
export const maxDuration = 30;

/**
 * POST /api/receipts/[requestId]/attachments
 *
 * Wallet-sig auth required. Caller must be EITHER the receipt's recipient (the pubkey the
 * sealed-box is decryptable for; today that's the card.authority for agent receipts, the
 * merchant_pubkey for merchant-side receipts) OR the original sender (proves attachment
 * authorship).
 *
 * Body (multipart/form-data):
 *   ciphertext     (Blob, application/octet-stream) — pre-encrypted via lib/voice-note
 *   kind           "voice_note" | "text_note" | "image"
 *   duration_ms    integer (voice notes only)
 *   mime_type      original audio mime type (so /play sets the right Content-Type)
 *   sealed_box_for (pubkey the decrypt-rights belong to — usually the recipient)
 *
 * Server:
 *   1. Verifies caller pubkey vs receipt's recipient OR card.authority (sender side)
 *   2. Uploads ciphertext to Storage bucket `receipt-attachments/<request_id>/<uuid>.bin`
 *   3. Inserts metadata row
 *   4. Fires push to sealed_box_for_pubkey (the recipient) — "@sender attached a voice note"
 */

interface InsertedAttachment {
  id: string;
  storage_path: string;
}

const MAX_BYTES = 512 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }

  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth?.reason ?? "missing_signature" },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    return NextResponse.json({ error: "invalid_form_data", message: (e as Error).message }, { status: 400 });
  }

  const ciphertext = formData.get("ciphertext");
  const kind = (formData.get("kind") as string | null) ?? "voice_note";
  const durationMsRaw = formData.get("duration_ms") as string | null;
  const mimeType = (formData.get("mime_type") as string | null) ?? "audio/webm";
  const sealedBoxFor = formData.get("sealed_box_for") as string | null;

  if (!(ciphertext instanceof Blob)) {
    return NextResponse.json({ error: "missing_ciphertext" }, { status: 400 });
  }
  if (ciphertext.size === 0 || ciphertext.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "ciphertext_size_invalid", size: ciphertext.size, max: MAX_BYTES },
      { status: 400 },
    );
  }
  if (!["voice_note", "text_note", "image"].includes(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (!sealedBoxFor || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(sealedBoxFor)) {
    return NextResponse.json({ error: "invalid_sealed_box_for_pubkey" }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Verify caller is either the recipient OR the receipt's card.authority (sender side)
  const { data: receipt, error: rErr } = await supabase
    .from("receipts")
    .select("request_id, card_pubkey, merchant_pubkey")
    .eq("request_id", requestId)
    .maybeSingle();
  if (rErr) {
    return NextResponse.json({ error: "supabase_error", message: rErr.message }, { status: 502 });
  }
  if (!receipt) {
    return NextResponse.json({ error: "receipt_not_found" }, { status: 404 });
  }

  const { data: card } = await supabase
    .from("agent_cards")
    .select("authority_pubkey")
    .eq("card_pubkey", receipt.card_pubkey)
    .maybeSingle();

  const callerIsAuthority = card?.authority_pubkey === auth.pubkey;
  const callerIsSealedRecipient = sealedBoxFor === auth.pubkey;
  const callerIsMerchant = receipt.merchant_pubkey === auth.pubkey;
  if (!callerIsAuthority && !callerIsSealedRecipient && !callerIsMerchant) {
    return NextResponse.json(
      { error: "forbidden", message: "Only the receipt's authority/recipient/merchant may attach." },
      { status: 403 },
    );
  }

  // Upload ciphertext to Storage
  const bytes = new Uint8Array(await ciphertext.arrayBuffer());
  const fileId = crypto.randomUUID();
  const objectPath = `${requestId}/${fileId}.bin`;
  const { error: uploadErr } = await supabase.storage
    .from("receipt-attachments")
    .upload(objectPath, bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: "storage_upload_failed", message: uploadErr.message },
      { status: 502 },
    );
  }

  // Insert metadata row
  const durationMs = durationMsRaw ? Math.max(0, Math.min(60_000, Number(durationMsRaw))) : null;
  const { data: row, error: insertErr } = await supabase
    .from("receipt_attachments")
    .insert({
      request_id: requestId,
      kind,
      storage_path: objectPath,
      sealed_box_for_pubkey: sealedBoxFor,
      duration_ms: durationMs,
      mime_type: mimeType,
      bytes: bytes.byteLength,
      created_by_pubkey: auth.pubkey,
    })
    .select("id, storage_path")
    .single();

  if (insertErr || !row) {
    // Roll back the storage upload best-effort
    await supabase.storage.from("receipt-attachments").remove([objectPath]);
    return NextResponse.json(
      { error: "supabase_error", message: insertErr?.message ?? "insert_failed" },
      { status: 502 },
    );
  }

  // Fire follow-up push to recipient (best-effort, non-fatal)
  if (sealedBoxFor !== auth.pubkey) {
    try {
      await sendPushToPubkey(sealedBoxFor, {
        title: kind === "voice_note" ? "🎙 Voice note attached" : "Note attached to receipt",
        body: `Attached to receipt ${requestId.slice(0, 8)}…`,
        url: `/receipts/${requestId}`,
      });
    } catch (e) {
      console.warn("[attachments] follow-up push failed:", (e as Error).message);
    }
  }

  return NextResponse.json({
    ok: true,
    attachment: {
      id: row.id,
      kind,
      duration_ms: durationMs,
      mime_type: mimeType,
      bytes: bytes.byteLength,
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
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

  // Authorization check: caller must be either the receipt's authority OR a sealed_box_for_pubkey
  // on at least one attachment for this receipt.
  const { data: receipt } = await supabase
    .from("receipts")
    .select("card_pubkey, merchant_pubkey")
    .eq("request_id", requestId)
    .maybeSingle();
  if (!receipt) {
    return NextResponse.json({ error: "receipt_not_found" }, { status: 404 });
  }

  const { data: card } = await supabase
    .from("agent_cards")
    .select("authority_pubkey")
    .eq("card_pubkey", receipt.card_pubkey)
    .maybeSingle();

  const isAuthority = card?.authority_pubkey === auth.pubkey;
  const isMerchant = receipt.merchant_pubkey === auth.pubkey;

  // Pull attachments. If caller is recipient (authority or merchant), they see all.
  // Otherwise, filter to those addressed to them.
  let q = supabase
    .from("receipt_attachments")
    .select("id, kind, duration_ms, mime_type, bytes, created_by_pubkey, sealed_box_for_pubkey, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });
  if (!isAuthority && !isMerchant) {
    q = q.eq("sealed_box_for_pubkey", auth.pubkey);
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, attachments: data ?? [] });
}
