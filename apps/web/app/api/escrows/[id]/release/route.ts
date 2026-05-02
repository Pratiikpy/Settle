import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, TransactionInstruction, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { kernelCommit, kernelCommitToRecordReceiptArgs } from "@settle/sdk";
import { randomUUID } from "node:crypto";
import { recordReceiptIx, releaseDeliveryEscrowIx } from "../../../../../lib/anchor-client";
import { fetchPact, fetchAgentCard } from "../../../../../lib/account-decoder";
import { getUsdcMint } from "../../../../../lib/solana";
import { withIdempotency } from "../../../../../lib/idempotency";

export const runtime = "nodejs";

/**
 * POST /api/escrows/[id]/release
 * body: { caller: pubkey }
 *
 * Builds an unsigned `release_delivery_escrow` Tx for the caller's wallet to sign.
 * Caller may be the buyer (any time) or anyone after confirm_deadline_slot. The
 * on-chain ix enforces that — this endpoint mirrors the constraint with friendlier
 * error messages.
 *
 * The merchant pubkey for the destination ATA is read from the pact's pinned variant
 * payload; the request body cannot override it.
 */

const Body = z.object({
  caller: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
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
  return withIdempotency(req, `/api/escrows/${id}/release`, () =>
    releaseHandler(req, id),
  );
}

async function releaseHandler(req: NextRequest, id: string) {
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

  const caller = new PublicKey(parsed.data.caller);
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

  // Permissionless caller must wait for the deadline.
  const slot = BigInt(await connection.getSlot("confirmed"));
  const isBuyer = caller.equals(pact.authority);
  if (!isBuyer && slot < pact.mode.confirmDeadlineSlot) {
    const slotsLeft = pact.mode.confirmDeadlineSlot - slot;
    return NextResponse.json(
      {
        error: "confirm_deadline_not_passed",
        message: `Permissionless release requires the confirm deadline to have passed (~${slotsLeft} slots remaining).`,
      },
      { status: 425 }, // Too Early
    );
  }

  const ix = releaseDeliveryEscrowIx({
    caller,
    pact: pactPubkey,
    merchant: pact.mode.merchant,
    usdcMint: new PublicKey(getUsdcMint()),
  });

  // ─────────────────────────────────────────────────────────────────────
  // Universal Receipt Kernel — F2.0
  //
  // The release_delivery_escrow ix doesn't accept hash args (it's a state
  // transition, not a TransferChecked-with-receipt), so we attach the
  // kernel commit as a Memo program ix in the same tx. After confirmation
  // a verifier reads the memo + canonical objects from DB to re-derive.
  // ─────────────────────────────────────────────────────────────────────
  const parentCard = await fetchAgentCard(connection, pact.parentCard);
  if (!parentCard) {
    return NextResponse.json(
      { error: "parent_card_not_found", message: "Parent AgentCard could not be fetched." },
      { status: 500 },
    );
  }
  const requestId = randomUUID();
  const releaseAmount = pact.mode.amount;
  const kernel = kernelCommit({
    kind: "escrow_release",
    request_id: requestId,
    amount_lamports: releaseAmount.toString(),
    sender: pact.authority.toBase58(),
    recipient: pact.mode.merchant.toBase58(),
    decision_slot: Number(slot),
    purpose_text: `escrow release: ${releaseAmount} lamports to merchant`,
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
    buyer_confirmed: isBuyer,
  });

  // Path A: structured on-chain attestation. Caller signs the tx so they
  // are the natural attestor for the kernel commit.
  const kernelIx = recordReceiptIx({
    attestor: caller,
    args: kernelCommitToRecordReceiptArgs(kernel),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(ix, kernelIx);
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = caller;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    transaction: txBase64,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    is_buyer_confirmed: isBuyer,
    message: isBuyer
      ? "Confirm receipt — vault drains to merchant."
      : "Permissionless release — deadline has passed; vault drains to merchant.",
    receipt: {
      request_id: requestId,
      kind: kernel.kind,
      hashes: kernel.hashes,
      context_hash: kernel.context_hash,
    },
  });
}
