import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/relayer
 *
 * Returns the public information about Settle's relayer wallet — the
 * pubkey, what it's allowed to do, and what cards delegated to it can
 * spend. This is consumed by /settings/relayer to render an honest
 * "if you delegate to this pubkey, here's what it can do" panel BEFORE
 * the user authorizes anything.
 *
 * Why an endpoint and not env exposure: SETTLE_RELAYER_PRIVKEY is a
 * server-only secret. Deriving the pubkey at runtime keeps the secret
 * out of NEXT_PUBLIC_ vars (which leak to the bundle) AND lets us
 * validate the key is actually configured before the UI offers
 * delegation. If the relayer isn't configured, the UI shows a
 * "delegation unavailable" state instead of a broken pubkey.
 */

interface RelayerInfo {
  configured: boolean;
  pubkey: string | null;
  capabilities: string[];
  unsupported: string[];
}

export async function GET() {
  const b58 = process.env.SETTLE_RELAYER_PRIVKEY;
  if (!b58) {
    const info: RelayerInfo = {
      configured: false,
      pubkey: null,
      capabilities: [],
      unsupported: [],
    };
    return NextResponse.json({ ok: true, relayer: info });
  }
  let pubkey: string;
  try {
    const kp = Keypair.fromSecretKey(bs58.decode(b58));
    pubkey = kp.publicKey.toBase58();
  } catch {
    return NextResponse.json(
      { error: "relayer_decode_failed" },
      { status: 503 },
    );
  }
  const info: RelayerInfo = {
    configured: true,
    pubkey,
    capabilities: [
      "Fire scheduled_sends on cadence (DAILY/WEEKLY/MONTHLY)",
      "Top up cards via auto_refill_rules when balance drops below threshold",
      "Fulfill gift_sends after the recipient signs a claim message",
      "Refund expired gift_sends back to sender_pubkey",
    ],
    unsupported: [
      "Spending outside a card's daily_cap",
      "Adding/removing merchants from the card's allowlist",
      "Pausing or revoking the card (owner-only)",
      "Rotating to a different agent_pubkey (impossible — cards are issued for life)",
    ],
  };
  return NextResponse.json({ ok: true, relayer: info });
}
