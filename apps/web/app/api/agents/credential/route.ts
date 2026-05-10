import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { fetchAgentCard } from "../../../../lib/account-decoder";

export const runtime = "nodejs";

/**
 * POST /api/agents/credential
 * body: {
 *   card_pubkey: pubkey,
 *   agent_pubkey: pubkey,
 *   expires_at_iso: string (ISO 8601),
 *   capabilities: hex[],            // 32-byte capability hashes
 *   authority_signature_b58?: string  // optional client-supplied (Phantom-signed envelope)
 * }
 *
 * Two modes:
 *   1. Server-signed (sandbox / facilitator-as-authority): if SETTLE_FACILITATOR_PRIVKEY env
 *      matches the on-chain card.authority, the server signs the envelope with that key.
 *      This is the V1 sandbox path.
 *   2. Client-signed (production): client signs the canonical envelope with Phantom + posts the
 *      base58 signature back. Server validates against on-chain card.authority and assembles
 *      the final settle:// URI. (V2 — currently we accept it but don't enforce.)
 *
 * Returns the `settle://` URI ready to paste into demo-agent/.env as SETTLE_CREDENTIAL.
 */

const MAX_CREDENTIAL_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const BodySchema = z.object({
  card_pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  agent_pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  expires_at_iso: z.string().datetime(),
  capabilities: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(20),
  authority_signature_b58: z.string().optional(),
});

interface UpstashResp {
  result: number | string | null;
}
async function upstash(command: string[]): Promise<UpstashResp | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/${command.join("/")}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as UpstashResp;
  } catch {
    return null;
  }
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

/** Canonical JSON: sorted keys, drop authority_sig, no whitespace. */
function canonicalEnvelopeBytes(envelope: Record<string, unknown>): Uint8Array {
  const { authority_sig: _omit, ...rest } = envelope;
  void _omit;
  const sorted = Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
  return new TextEncoder().encode(JSON.stringify(sorted));
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parse = BodySchema.safeParse(raw);
  if (!parse.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parse.error.issues },
      { status: 400 },
    );
  }
  const body = parse.data;

  // Cap credential lifetime so a caller can't mint a forever-credential.
  const expiresMs = new Date(body.expires_at_iso).getTime();
  if (Number.isNaN(expiresMs)) {
    return NextResponse.json({ error: "invalid_expires_at" }, { status: 400 });
  }
  if (expiresMs - Date.now() > MAX_CREDENTIAL_TTL_MS) {
    return NextResponse.json(
      {
        error: "expires_at_too_far",
        message: "expires_at_iso must be within 90 days of now",
      },
      { status: 400 },
    );
  }
  if (expiresMs <= Date.now()) {
    return NextResponse.json(
      { error: "expires_at_in_past" },
      { status: 400 },
    );
  }

  // Per-card rate limit: 60 credential mints per 10 minutes. Defense in
  // depth against an attacker who acquired one valid signature trying to
  // spam-generate credentials with different capability lists.
  const rlKey = `cred:${body.card_pubkey}`;
  const rlIncr = await upstash(["incr", rlKey]);
  if (rlIncr && Number(rlIncr.result) === 1) {
    await upstash(["expire", rlKey, "600"]);
  }
  if (rlIncr && Number(rlIncr.result) > 60) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: 600 },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  // 1. Fetch on-chain AgentCard to validate ownership + agent_pubkey
  const conn = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const card = await fetchAgentCard(conn, new PublicKey(body.card_pubkey));
  if (!card) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }
  if (card.agentPubkey.toBase58() !== body.agent_pubkey) {
    return NextResponse.json(
      { error: "agent_pubkey_mismatch", on_chain: card.agentPubkey.toBase58() },
      { status: 400 },
    );
  }
  if (card.revoked) {
    return NextResponse.json({ error: "card_revoked" }, { status: 410 });
  }

  // 2. Build canonical envelope
  const envelope = {
    v: 1 as const,
    card: body.card_pubkey,
    agent_pubkey: body.agent_pubkey,
    expires_at: body.expires_at_iso,
    capabilities: body.capabilities,
  };

  // 3. Sign — either client-supplied or server-signed (sandbox)
  let authoritySigB58: string;

  if (body.authority_signature_b58) {
    // Client-signed mode: validate against on-chain card.authority
    try {
      const sig = bs58.decode(body.authority_signature_b58);
      const valid = ed25519.verify(sig, canonicalEnvelopeBytes(envelope), card.authority.toBytes());
      if (!valid) {
        return NextResponse.json({ error: "authority_sig_invalid" }, { status: 401 });
      }
      authoritySigB58 = body.authority_signature_b58;
    } catch {
      return NextResponse.json({ error: "authority_sig_decode_failed" }, { status: 400 });
    }
  } else {
    // Server-signed mode: facilitator key must match card.authority
    const facB58 = process.env.SETTLE_FACILITATOR_PRIVKEY;
    if (!facB58) {
      return NextResponse.json(
        {
          error: "credential_signing_unavailable",
          message:
            "Either supply authority_signature_b58 (Phantom-signed) or set SETTLE_FACILITATOR_PRIVKEY (sandbox mode where server == card.authority).",
        },
        { status: 503 },
      );
    }
    const facSecret = bs58.decode(facB58);
    if (facSecret.length !== 64) {
      return NextResponse.json({ error: "facilitator_key_invalid_length" }, { status: 503 });
    }
    const facPub = facSecret.slice(32, 64);
    if (Buffer.from(facPub).toString("hex") !== Buffer.from(card.authority.toBytes()).toString("hex")) {
      return NextResponse.json(
        {
          error: "facilitator_authority_mismatch",
          message:
            "SETTLE_FACILITATOR_PRIVKEY does not match card.authority. Use the user's wallet to sign instead.",
          card_authority: card.authority.toBase58(),
        },
        { status: 503 },
      );
    }
    const sig = ed25519.sign(canonicalEnvelopeBytes(envelope), facSecret.slice(0, 32));
    authoritySigB58 = bs58.encode(sig);
  }

  // 4. Assemble final settle:// URI
  const finalEnvelope = { ...envelope, authority_sig: authoritySigB58 };
  const json = JSON.stringify(finalEnvelope);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const credential = `settle://${b64}`;

  return NextResponse.json({
    ok: true,
    credential,
    card: body.card_pubkey,
    agent_pubkey: body.agent_pubkey,
    expires_at: body.expires_at_iso,
    note: "Save as SETTLE_CREDENTIAL in apps/demo-agent/.env",
  });
}
