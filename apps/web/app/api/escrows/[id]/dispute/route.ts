import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, TransactionInstruction, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { kernelCommit, kernelCommitToRecordReceiptArgs } from "@settle/sdk";
import { randomUUID } from "node:crypto";
import { disputeDeliveryEscrowIx, recordReceiptIx } from "../../../../../lib/anchor-client";
import { fetchPact, fetchAgentCard } from "../../../../../lib/account-decoder";
import { getUsdcMint } from "../../../../../lib/solana";
import { withIdempotency } from "../../../../../lib/idempotency";

export const runtime = "nodejs";

/**
 * POST /api/escrows/[id]/dispute
 * body: { authority: pubkey }   // must equal pact.authority
 *
 * Builds an unsigned `dispute_delivery_escrow` Tx for the buyer's wallet to sign.
 * Refunds vault → buyer's USDC ATA. Allowed only before dispute_deadline_slot.
 */

const Body = z.object({
  authority: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withIdempotency(req, `/api/escrows/${id}/dispute`, () =>
    disputeHandler(req, id),
  );
}

async function disputeHandler(req: NextRequest, id: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) {
    return NextResponse.json({ error: "invalid_pact_id" }, { status: 400 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const authority = new PublicKey(parsed.data.authority);
  const pactPubkey = new PublicKey(id);
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  const pact = await fetchPact(connection, pactPubkey);
  if (!pact) return NextResponse.json({ error: "pact_not_found" }, { status: 404 });
  if (pact.closed) return NextResponse.json({ error: "pact_closed" }, { status: 409 });
  if (pact.mode.kind !== "deliveryEscrow") {
    return NextResponse.json({ error: "not_delivery_escrow_mode" }, { status: 400 });
  }
  if (pact.mode.released) {
    return NextResponse.json({ error: "already_released" }, { status: 409 });
  }
  if (pact.mode.refunded) {
    return NextResponse.json({ error: "already_refunded" }, { status: 409 });
  }
  if (!pact.authority.equals(authority)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const slot = BigInt(await connection.getSlot("confirmed"));
  if (slot >= pact.mode.disputeDeadlineSlot) {
    return NextResponse.json(
      { error: "dispute_window_closed", message: "Dispute window has closed." },
      { status: 410 }, // Gone
    );
  }

  const ix = disputeDeliveryEscrowIx({
    authority,
    pact: pactPubkey,
    usdcMint: new PublicKey(getUsdcMint()),
  });

  // ─────────────────────────────────────────────────────────────────────
  // Universal Receipt Kernel — F2.0
  //
  // Same pattern as escrow release: dispute_delivery_escrow ix doesn't
  // accept hash args, so we attach the kernel commit as a Memo ix.
  // recipient = authority (since dispute refunds buyer).
  // ─────────────────────────────────────────────────────────────────────
  const parentCard = await fetchAgentCard(connection, pact.parentCard);
  if (!parentCard) {
    return NextResponse.json(
      { error: "parent_card_not_found", message: "Parent AgentCard could not be fetched." },
      { status: 500 },
    );
  }
  const requestId = randomUUID();
  const refundAmount = pact.mode.amount;
  const kernel = kernelCommit({
    kind: "escrow_dispute",
    request_id: requestId,
    amount_lamports: refundAmount.toString(),
    sender: pact.mode.merchant.toBase58(), // funds came from merchant's escrow vault
    recipient: pact.authority.toBase58(),  // returns to buyer
    decision_slot: Number(slot),
    purpose_text: `escrow dispute: ${refundAmount} lamports refunded to buyer`,
    card_pubkey: pact.parentCard.toBase58(),
    pact_pubkey: pactPubkey.toBase58(),
    capability_hash: pact.mode.capabilityHash.toString("hex"),
    policy_version: parentCard.policyVersion,
    daily_cap_lamports: parentCard.dailyCapLamports.toString(),
    per_call_max_lamports: parentCard.perCallMaxLamports.toString(),
    allowlist_count: parentCard.allowlist.length,
    expiry_slot: Number(parentCard.expirySlot),
    revoked: parentCard.revoked,
    cap_remaining_after: (
      parentCard.dailyCapLamports - parentCard.usedToday
    ).toString(),
  });

  // Path A: authority is both the dispute caller and the kernel attestor.
  const kernelIx = recordReceiptIx({
    attestor: authority,
    args: kernelCommitToRecordReceiptArgs(kernel),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(ix, kernelIx);
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = authority;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    transaction: txBase64,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: "Dispute — vault refunds to your USDC ATA.",
    receipt: {
      request_id: requestId,
      kind: kernel.kind,
      hashes: kernel.hashes,
      context_hash: kernel.context_hash,
    },
  });
}
