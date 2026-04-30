import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { releaseDeliveryEscrowIx } from "../../../../../lib/anchor-client";
import { fetchPact } from "../../../../../lib/account-decoder";
import { getUsdcMint } from "../../../../../lib/solana";

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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(ix);
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
  });
}
