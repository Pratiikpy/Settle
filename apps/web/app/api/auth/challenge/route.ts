import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthMessage } from "../../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * GET /api/auth/challenge?pubkey=<base58>
 *
 * Returns a fresh challenge for the given pubkey. Client signs the `message` with Phantom
 * (signMessage), then attaches { auth_pubkey, auth_sig, auth_nonce, auth_ts } to subsequent
 * authenticated requests.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const pubkey = url.searchParams.get("pubkey");
  if (!pubkey || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pubkey)) {
    return NextResponse.json({ error: "invalid_or_missing_pubkey" }, { status: 400 });
  }

  const nonce = randomBytes(16).toString("hex");
  const tsUnix = Math.floor(Date.now() / 1000);
  const message = buildAuthMessage({ nonce, tsUnix, pubkey });

  return NextResponse.json({
    ok: true,
    nonce,
    ts: tsUnix,
    pubkey,
    message,
    expires_in_seconds: 300,
    instructions:
      "Call window.solana.signMessage(new TextEncoder().encode(message)). Send signature (base58) + nonce + ts + pubkey on subsequent authenticated requests as auth_sig, auth_nonce, auth_ts, auth_pubkey query params or x-settle-auth-* headers.",
  });
}
