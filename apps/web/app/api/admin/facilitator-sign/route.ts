import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { authFromRequest } from "../../../../lib/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Test-only signing oracle.
 *
 * The proxy verifies an `X-Settle-Sig` per-request signature from the agent
 * (= the facilitator in pact mode). To prove the full ALLOW round-trip from a
 * developer machine that doesn't hold SETTLE_FACILITATOR_PRIVKEY, we expose
 * this small helper: pass canonical request bytes, get back a base58 Ed25519
 * signature from the facilitator + the facilitator's pubkey.
 *
 * Auth: deployer wallet sig (same pattern as /api/admin/seed-demo-merchants).
 *
 * GET  → just returns the facilitator pubkey.
 * POST → { canonical_b64 } → { sig_b58, facilitator_pubkey }
 *
 * SECURITY: this is gated to the deployer pubkey only. Anyone else gets 403.
 * The signing is over canonical request bytes the proxy itself would verify,
 * so the worst-case misuse is the deployer paying their own demo-card to
 * their own demo-merchants — no funds escape the deployer's own pact cap.
 */

function getFacilitatorKeypair(): { secret: Uint8Array; pubkey: string } | null {
  const b58 = process.env.SETTLE_FACILITATOR_PRIVKEY;
  if (!b58) return null;
  try {
    const secret = bs58.decode(b58);
    if (secret.length !== 64) return null;
    const pub = secret.slice(32, 64);
    const pubkey = bs58.encode(pub);
    return { secret, pubkey };
  } catch {
    return null;
  }
}

async function requireDeployerAuth(req: NextRequest): Promise<NextResponse | null> {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth?.ok === false ? auth.reason : "missing" },
      { status: 401 },
    );
  }
  const allowed = process.env.SETTLE_DEPLOYER_PUBKEY;
  if (!allowed || auth.pubkey !== allowed) {
    return NextResponse.json(
      { error: "forbidden", message: "only the deployer pubkey may use this signer" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const fail = await requireDeployerAuth(req);
  if (fail) return fail;
  const f = getFacilitatorKeypair();
  if (!f) {
    return NextResponse.json(
      { error: "facilitator_unconfigured" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, facilitator_pubkey: f.pubkey });
}

export async function POST(req: NextRequest) {
  const fail = await requireDeployerAuth(req);
  if (fail) return fail;
  const f = getFacilitatorKeypair();
  if (!f) {
    return NextResponse.json(
      { error: "facilitator_unconfigured" },
      { status: 503 },
    );
  }
  let body: { canonical_b64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.canonical_b64 || typeof body.canonical_b64 !== "string") {
    return NextResponse.json(
      { error: "missing_canonical_b64" },
      { status: 400 },
    );
  }
  let canonical: Buffer;
  try {
    canonical = Buffer.from(body.canonical_b64, "base64");
  } catch {
    return NextResponse.json({ error: "invalid_base64" }, { status: 400 });
  }
  if (canonical.length === 0 || canonical.length > 16384) {
    return NextResponse.json(
      { error: "canonical_length_invalid" },
      { status: 400 },
    );
  }
  const sig = ed25519.sign(canonical, f.secret.slice(0, 32));
  return NextResponse.json({
    ok: true,
    facilitator_pubkey: f.pubkey,
    sig_b58: bs58.encode(sig),
  });
}
