import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/sealed-box-pubkey
 *
 * Returns the deployment's public X25519 key used for sealed-box encryption of
 * off-chain receipt metadata + attachments. The privkey lives only on the server.
 *
 * Public-safe: the recipient pubkey is not a secret. Returning it lets the browser
 * encrypt voice notes / text notes locally before upload.
 */
export async function GET() {
  const pub = process.env.SETTLE_SEALED_BOX_PUBKEY ?? process.env.NEXT_PUBLIC_SEALED_BOX_PUBKEY;
  if (!pub) {
    return NextResponse.json({ ok: false, configured: false }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    configured: true,
    pubkey_b64: pub,
  });
}
