import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { closePactIx, disputeDeliveryEscrowIx } from "../../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../../lib/solana";

export const runtime = "nodejs";

/**
 * POST /api/receipts/[requestId]/refund
 *
 * Routes refund per pact mode (F4 / refund-by-emoji):
 *
 *   • OneShot or Streaming Pact (current v0.2 modes)  → returns close_pact unsigned tx.
 *     Authority signs in browser; vault USDC drains back to authority's USDC ATA.
 *
 *   • DeliveryEscrow (P9, V0.3 wave 7)                → would return dispute_delivery_escrow.
 *     Not yet shipped; reserved here so the mode-detection code is ready.
 *
 *   • Direct spend (no pact_pubkey)                   → returns mode="not_refundable" with an
 *     honest message. The on-chain Anchor program transferred funds straight to the merchant;
 *     there is no buyer-side refund primitive for direct spends. record_denial is an audit
 *     event, not a refund. UI shows "contact the merchant."
 *
 * Body: { authority: pubkey, reason: string }
 *
 * Note: this endpoint does NOT submit the tx. It returns the unsigned base64 tx for the
 * client to sign with Phantom. The reason string is logged off-chain for support.
 */

const Body = z.object({
  authority: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  reason: z.string().min(1).max(280),
});

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parse = Body.safeParse(raw);
  if (!parse.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parse.error.issues },
      { status: 400 },
    );
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. Look up the receipt
  const { data: receipt, error: rErr } = await supabase
    .from("receipts")
    .select("request_id, card_pubkey, pact_pubkey, decision, created_at")
    .eq("request_id", requestId)
    .maybeSingle();
  if (rErr) {
    return NextResponse.json({ error: "supabase_error", message: rErr.message }, { status: 502 });
  }
  if (!receipt) {
    return NextResponse.json({ error: "receipt_not_found" }, { status: 404 });
  }
  if (receipt.decision !== "ALLOW") {
    return NextResponse.json(
      { mode: "not_refundable", message: "Only ALLOW receipts can be refunded." },
      { status: 400 },
    );
  }

  // 2. Verify caller authority owns the card
  const { data: card, error: cErr } = await supabase
    .from("agent_cards")
    .select("authority_pubkey")
    .eq("card_pubkey", receipt.card_pubkey)
    .maybeSingle();
  if (cErr) {
    return NextResponse.json({ error: "supabase_error", message: cErr.message }, { status: 502 });
  }
  if (!card || card.authority_pubkey !== parse.data.authority) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "Only the card authority can request a refund.",
      },
      { status: 403 },
    );
  }

  // 3. Direct spend (no pact) → honest "not refundable" response
  if (!receipt.pact_pubkey) {
    return NextResponse.json({
      ok: true,
      mode: "not_refundable",
      message:
        "This was a direct spend with no escrow. Funds went straight to the merchant. Contact the merchant directly for a refund — or pay via a Pact next time for buyer-side refund protection.",
    });
  }

  // 4. Pact-scoped → build the right ix per mode.
  //    OneShot/Streaming  → close_pact (refunds vault.amount to authority).
  //    DeliveryEscrow     → dispute_delivery_escrow (only valid before dispute_deadline_slot).
  const { data: pact, error: pErr } = await supabase
    .from("pacts")
    .select("pact_pubkey, mode, closed, released, refunded, dispute_deadline_slot")
    .eq("pact_pubkey", receipt.pact_pubkey)
    .maybeSingle();
  if (pErr) {
    return NextResponse.json({ error: "supabase_error", message: pErr.message }, { status: 502 });
  }
  if (!pact) {
    return NextResponse.json({ error: "pact_not_found" }, { status: 404 });
  }
  if (pact.closed) {
    return NextResponse.json(
      { mode: "not_refundable", message: "Pact is already closed." },
      { status: 400 },
    );
  }

  // Best-effort log the reason for support / future analytics.
  try {
    await supabase.from("refund_requests").insert({
      request_id: requestId,
      pact_pubkey: receipt.pact_pubkey,
      authority_pubkey: parse.data.authority,
      reason: parse.data.reason,
    });
  } catch {
    // table may not exist on older deploys; this is non-fatal
  }

  const authority = new PublicKey(parse.data.authority);
  const pactPubkey = new PublicKey(receipt.pact_pubkey);
  const usdcMint = new PublicKey(getUsdcMint());
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  const pactMode = (pact.mode ?? "oneshot") as "oneshot" | "streaming" | "delivery_escrow";

  let ix;
  let mode: "pact_close" | "escrow_dispute";
  let message: string;

  if (pactMode === "delivery_escrow") {
    // Buyer-only dispute path — must be inside the dispute window and not already
    // released/refunded. The on-chain ix re-checks all of this; we mirror the checks
    // here for friendlier UX errors.
    if (pact.released) {
      return NextResponse.json(
        { mode: "not_refundable", message: "Escrow already released to the merchant." },
        { status: 409 },
      );
    }
    if (pact.refunded) {
      return NextResponse.json(
        { mode: "not_refundable", message: "Escrow already refunded." },
        { status: 409 },
      );
    }
    const slot = BigInt(await connection.getSlot("confirmed"));
    const disputeDl = BigInt(pact.dispute_deadline_slot ?? "0");
    if (disputeDl > 0n && slot >= disputeDl) {
      return NextResponse.json(
        {
          mode: "not_refundable",
          message:
            "Dispute window has closed. The merchant can call permissionless release any time now.",
        },
        { status: 410 },
      );
    }
    ix = disputeDeliveryEscrowIx({ authority, pact: pactPubkey, usdcMint });
    mode = "escrow_dispute";
    message = "Sign to dispute — vault refunds to your USDC ATA.";
  } else {
    // OneShot + Streaming: close the pact and reclaim unspent vault balance.
    ix = closePactIx({ authority, pact: pactPubkey, usdcMint });
    mode = "pact_close";
    message = "Sign to close pact and refund unspent USDC to your wallet.";
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(ix);
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = authority;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    mode,
    transaction: txBase64,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message,
  });
}
