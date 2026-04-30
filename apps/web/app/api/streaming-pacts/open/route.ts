import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { blake3 } from "@noble/hashes/blake3";
import {
  openStreamingPactIx,
  findPactPda,
  findAgentCardPda,
  type AllowlistEntry,
} from "../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../lib/solana";
import { fetchAgentCard } from "../../../../lib/account-decoder";

export const runtime = "nodejs";

/**
 * POST /api/streaming-pacts/open
 * body: {
 *   authority: pubkey,
 *   parentCard: pubkey,
 *   scopeLabel: string,
 *   rateLamportsPerSlot: string,
 *   maxTotalLamports: string,
 *   allowlist: { merchant: pubkey, capabilityHashHex?: string }[],
 *   expirySlot: string,
 * }
 *
 * Returns an unsigned `open_streaming_pact` Tx for the authority's wallet to sign.
 * The pact PDA is derived from the parent card + BLAKE3(scopeLabel). The vault USDC
 * ATA is funded with `maxTotalLamports` atomically as part of the same ix.
 *
 * Allowlist entries must be a strict subset of the parent card's allowlist; the
 * on-chain ix enforces this. We re-validate here for early UX errors.
 */

const Body = z.object({
  authority: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  parentCard: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  scopeLabel: z.string().min(1).max(80),
  rateLamportsPerSlot: z.string().regex(/^\d+$/),
  maxTotalLamports: z.string().regex(/^\d+$/),
  allowlist: z
    .array(
      z.object({
        merchant: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
        capabilityHashHex: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
      }),
    )
    .min(1)
    .max(5),
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

  const authority = new PublicKey(body.authority);
  const parentCard = new PublicKey(body.parentCard);
  const usdcMint = new PublicKey(getUsdcMint());
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  const card = await fetchAgentCard(connection, parentCard);
  if (!card) {
    return NextResponse.json({ error: "parent_card_not_found" }, { status: 404 });
  }
  if (!card.authority.equals(authority)) {
    return NextResponse.json(
      { error: "unauthorized", message: "authority does not own parent card" },
      { status: 403 },
    );
  }

  // Verify scope label PDA derivation matches the parent card PDA derivation.
  const scopeLabelHash = Buffer.from(blake3(new TextEncoder().encode(body.scopeLabel)));
  const [pact] = findPactPda(parentCard, scopeLabelHash);
  // (sanity) recompute parent PDA to ensure caller sent us the right card
  const [expectedParent] = findAgentCardPda(card.authority, card.labelHash);
  if (!expectedParent.equals(parentCard)) {
    return NextResponse.json(
      { error: "parent_card_mismatch", message: "derived PDA differs from supplied parentCard" },
      { status: 400 },
    );
  }

  // Strict-subset allowlist check (mirrors on-chain validation for friendlier errors).
  const allowlist: AllowlistEntry[] = [];
  for (const entry of body.allowlist) {
    const merchant = new PublicKey(entry.merchant);
    const parentMatch = card.allowlist.find((e) => e.merchant.equals(merchant));
    if (!parentMatch) {
      return NextResponse.json(
        {
          error: "merchant_off_parent_allowlist",
          message: `merchant ${entry.merchant.slice(0, 6)}… is not on the parent card's allowlist`,
        },
        { status: 400 },
      );
    }
    const capabilityHash = entry.capabilityHashHex
      ? new Uint8Array(Buffer.from(entry.capabilityHashHex, "hex"))
      : null;
    if (parentMatch.capabilityHash) {
      if (!capabilityHash) {
        return NextResponse.json(
          {
            error: "capability_pin_required",
            message: `merchant ${entry.merchant.slice(0, 6)}… has a pinned capability on parent card; pact must pin too`,
          },
          { status: 400 },
        );
      }
      const parentHex = parentMatch.capabilityHash.toString("hex");
      if (parentHex.toLowerCase() !== entry.capabilityHashHex!.toLowerCase()) {
        return NextResponse.json(
          {
            error: "capability_pin_mismatch",
            message: `pact capability_hash differs from parent card's pin for ${entry.merchant.slice(0, 6)}…`,
          },
          { status: 400 },
        );
      }
    }
    allowlist.push({ merchant, capabilityHash });
  }

  const ix = openStreamingPactIx({
    authority,
    parentCard,
    pact,
    usdcMint,
    args: {
      scopeLabelHash: new Uint8Array(scopeLabelHash),
      rateLamportsPerSlot: BigInt(body.rateLamportsPerSlot),
      maxTotalLamports: BigInt(body.maxTotalLamports),
      allowlist,
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
    message: `Open streaming pact "${body.scopeLabel}" — funds vault with ${body.maxTotalLamports} lamports atomically.`,
  });
}
