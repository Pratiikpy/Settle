import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { blake3 } from "@noble/hashes/blake3";
import {
  openDeliveryEscrowIx,
  findPactPda,
  findAgentCardPda,
} from "../../../../lib/anchor-client";
import { fetchAgentCard } from "../../../../lib/account-decoder";
import { getUsdcMint } from "../../../../lib/solana";

export const runtime = "nodejs";

/**
 * POST /api/escrows/open
 * body: {
 *   authority: pubkey, parentCard: pubkey, scopeLabel: string,
 *   amount: string,            // atomic USDC
 *   merchant: pubkey,          // pinned at open; release cannot redirect
 *   capabilityHashHex: string, // 32-byte hex — the promise this escrow is buying
 *   confirmDeadlineSlot: string, disputeDeadlineSlot: string, expirySlot: string
 * }
 *
 * Returns an unsigned Tx for the buyer (= card.authority) to sign. The vault is funded
 * with `amount` atomically inside the same ix.
 */

const Body = z.object({
  authority: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  parentCard: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  scopeLabel: z.string().min(1).max(80),
  amount: z.string().regex(/^\d+$/),
  merchant: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  capabilityHashHex: z.string().regex(/^[0-9a-fA-F]{64}$/),
  confirmDeadlineSlot: z.string().regex(/^\d+$/),
  disputeDeadlineSlot: z.string().regex(/^\d+$/),
  expirySlot: z.string().regex(/^\d+$/),
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
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Cross-field invariant — also enforced on-chain, but better UX here.
  if (BigInt(body.confirmDeadlineSlot) > BigInt(body.disputeDeadlineSlot)) {
    return NextResponse.json(
      {
        error: "invalid_deadlines",
        message: "confirm_deadline_slot must be ≤ dispute_deadline_slot",
      },
      { status: 400 },
    );
  }

  const authority = new PublicKey(body.authority);
  const parentCard = new PublicKey(body.parentCard);
  const usdcMint = new PublicKey(getUsdcMint());
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  const card = await fetchAgentCard(connection, parentCard);
  if (!card) return NextResponse.json({ error: "parent_card_not_found" }, { status: 404 });
  if (!card.authority.equals(authority)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const scopeLabelHash = Buffer.from(blake3(new TextEncoder().encode(body.scopeLabel)));
  const [pact] = findPactPda(parentCard, scopeLabelHash);
  const [expectedParent] = findAgentCardPda(card.authority, card.labelHash);
  if (!expectedParent.equals(parentCard)) {
    return NextResponse.json(
      { error: "parent_card_mismatch" },
      { status: 400 },
    );
  }

  const ix = openDeliveryEscrowIx({
    authority,
    parentCard,
    pact,
    usdcMint,
    args: {
      scopeLabelHash: new Uint8Array(scopeLabelHash),
      amount: BigInt(body.amount),
      merchant: new PublicKey(body.merchant),
      capabilityHash: new Uint8Array(Buffer.from(body.capabilityHashHex, "hex")),
      confirmDeadlineSlot: BigInt(body.confirmDeadlineSlot),
      disputeDeadlineSlot: BigInt(body.disputeDeadlineSlot),
      expirySlot: BigInt(body.expirySlot),
    },
  });

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
    transaction: txBase64,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    pact: pact.toBase58(),
    message: `Open escrow "${body.scopeLabel}" with ${body.amount} lamports held until release or dispute.`,
  });
}
