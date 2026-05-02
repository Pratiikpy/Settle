import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { findPactPda, labelHashBytes, openPactIx } from "../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../lib/solana";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/gift-sends/spawn-pact
 *
 * body: { gift_id, authority }
 *
 * Builds an unsigned open_pact tx scoped to a single gift. The Pact:
 *   - lives under escrow_card
 *   - has cap = amount_lamports (exact funding, no overspend possible)
 *   - allowlist contains BOTH claimer_pubkey (for the claim leg) AND
 *     refund_pubkey (for the auto-refund leg if expired)
 *   - expires at gift_sends.expires_at
 *
 * Without this, the relayer cron sees a `claimed` gift but has no
 * Pact to spend through, so the audit row reads 'no pact under
 * escrow card'. After this lands, claim/refund both fire automatically.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const Body = z.object({
  gift_id: z.string().uuid(),
  authority: z.string().regex(PUBKEY_RE),
});

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const v = parsed.data;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  const { data: gift } = await sb
    .from("gift_sends")
    .select(
      "gift_id, sender_pubkey, escrow_card, amount_lamports, refund_pubkey, expires_at, pact_pubkey, claim_request_id, status",
    )
    .eq("gift_id", v.gift_id)
    .maybeSingle();
  if (!gift) {
    return NextResponse.json({ error: "gift_not_found" }, { status: 404 });
  }
  if (gift.sender_pubkey !== v.authority) {
    return NextResponse.json({ error: "not_your_gift" }, { status: 403 });
  }
  if (gift.pact_pubkey) {
    return NextResponse.json(
      { error: "already_has_pact", pact_pubkey: gift.pact_pubkey },
      { status: 409 },
    );
  }
  // Once a gift is claimed/refunded the Pact is needed RIGHT NOW for
  // the signer to fire. Allow spawning at any non-terminal status.

  const authority = new PublicKey(v.authority);
  const escrowCard = new PublicKey(gift.escrow_card);
  const usdcMint = new PublicKey(getUsdcMint());

  // Pre-fetch the gift's claimer if known (gift may not be claimed yet
  // — in that case we put a placeholder allowlist that the user can
  // top up later. For v0, fail until claim happens because we need the
  // claimer pubkey on the allowlist.)
  // NB: claimer_pubkey isn't in the select above; re-query if needed.
  const { data: claimRow } = await sb
    .from("gift_sends")
    .select("claimer_pubkey")
    .eq("gift_id", v.gift_id)
    .maybeSingle();
  if (!claimRow?.claimer_pubkey) {
    return NextResponse.json(
      {
        error: "claimer_unknown",
        hint: "Wait for the recipient to claim the gift, then spawn the pact. The relayer will fire as soon as it lands.",
      },
      { status: 409 },
    );
  }

  const claimer = new PublicKey(claimRow.claimer_pubkey);
  const refundPk = new PublicKey(gift.refund_pubkey ?? gift.sender_pubkey);

  const scopeLabel = `gift-${v.gift_id.slice(0, 8)}`;
  const scopeHash = labelHashBytes(scopeLabel);
  const [pactPda] = findPactPda(escrowCard, scopeHash);

  // Cap = amount (exact). The vault holds exactly this much; no
  // overspend possible even if both claim AND refund somehow fire.
  const capLamports = BigInt(gift.amount_lamports);

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const currentSlot = await connection.getSlot("confirmed");

  // The gift's expires_at is wall-clock; the on-chain ix wants an
  // absolute Solana slot. Devnet runs ~400ms/slot, so seconds × 2.5.
  const expiresAt = new Date(gift.expires_at);
  const deltaMs = Math.max(0, expiresAt.getTime() - Date.now());
  const slotsUntilExpiry = BigInt(Math.floor(deltaMs / 400));
  const absoluteExpirySlot = BigInt(currentSlot) + slotsUntilExpiry;

  const ix = openPactIx({
    authority,
    parentCard: escrowCard,
    pact: pactPda,
    usdcMint,
    args: {
      scopeLabelHash: scopeHash,
      capLamports,
      // Both claimer AND refund target on the allowlist — either can
      // be paid, but ONLY them. Even if relayer is compromised.
      allowlist: [
        { merchant: claimer, capabilityHash: null },
        { merchant: refundPk, capabilityHash: null },
      ],
      expirySlot: absoluteExpirySlot,
    },
  });

  const tx = new Transaction().add(ix);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = authority;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    transaction: txBase64,
    pact_pubkey: pactPda.toBase58(),
    cap_lamports: capLamports.toString(),
    cap_usdc: (Number(capLamports) / 1e6).toFixed(2),
    scope_label: scopeLabel,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: `Spawn Pact for gift ${v.gift_id.slice(0, 8)}…: cap $${(Number(capLamports) / 1e6).toFixed(2)} USDC, allowlist = [claimer, refund_target].`,
  });
}
