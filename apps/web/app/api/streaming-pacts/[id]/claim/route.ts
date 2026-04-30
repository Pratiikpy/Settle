import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { z } from "zod";
import bs58 from "bs58";
import { blake3 } from "@noble/hashes/blake3";
import { claimStreamingIxWithAtas } from "../../../../../lib/anchor-client";
import { fetchPact, fetchAgentCard } from "../../../../../lib/account-decoder";
import { getUsdcMint } from "../../../../../lib/solana";

export const runtime = "nodejs";

/**
 * POST /api/streaming-pacts/[id]/claim
 *
 * The agent (server-side `SETTLE_FACILITATOR_PRIVKEY`, which equals card.agent_pubkey)
 * draws accrued entitlement to a specified merchant and submits the on-chain claim.
 *
 * body: { merchant: pubkey, purpose: string }
 *
 * For Wave 5 the full canonical receipt-hash chain is not folded in (that pipeline lives
 * in the x402 proxy). The claim ix accepts 32-byte hashes; for the demo we derive them
 * from BLAKE3(JSON({ purpose, pact, merchant, slot })). When the streaming pact is wired
 * into the proxy in Wave 6+, those will become real canonical hashes per the same
 * receipt-builder used by spend_via_pact.
 *
 * Returns: { ok: true, signature, amount, claimed_after, max_remaining_after } or an error.
 */

const BodySchema = z.object({
  merchant: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  purpose: z.string().min(1).max(280),
});

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

function fastHash(label: string, parts: Array<string | number>): Buffer {
  const input = `${label}:${parts.join("|")}`;
  return Buffer.from(blake3(new TextEncoder().encode(input)));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) {
    return NextResponse.json({ error: "invalid_pact_id" }, { status: 400 });
  }

  const facilitatorB58 = process.env.SETTLE_FACILITATOR_PRIVKEY;
  if (!facilitatorB58) {
    return NextResponse.json(
      { error: "facilitator_key_not_configured" },
      { status: 503 },
    );
  }
  let facilitator: Keypair;
  try {
    facilitator = Keypair.fromSecretKey(bs58.decode(facilitatorB58));
  } catch {
    return NextResponse.json({ error: "facilitator_key_decode_failed" }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const pactPubkey = new PublicKey(id);
  const merchantPubkey = new PublicKey(parsed.data.merchant);

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  // Verify pact + card on-chain to produce a useful error if mode is wrong.
  const pact = await fetchPact(connection, pactPubkey);
  if (!pact) return NextResponse.json({ error: "pact_not_found" }, { status: 404 });
  if (pact.closed) return NextResponse.json({ error: "pact_closed" }, { status: 409 });
  if (pact.mode.kind !== "streaming") {
    return NextResponse.json({ error: "not_streaming_mode" }, { status: 400 });
  }

  const card = await fetchAgentCard(connection, pact.parentCard);
  if (!card) return NextResponse.json({ error: "parent_card_not_found" }, { status: 404 });

  if (!facilitator.publicKey.equals(card.agentPubkey)) {
    return NextResponse.json(
      {
        error: "facilitator_agent_mismatch",
        message:
          "SETTLE_FACILITATOR_PRIVKEY does not equal card.agent_pubkey. The agent must sign claim_streaming.",
      },
      { status: 503 },
    );
  }

  // Locate the merchant's allowlist entry (capability hash, if any).
  const entry = pact.allowlist.find((e) => e.merchant.equals(merchantPubkey));
  if (!entry) {
    return NextResponse.json(
      { error: "merchant_off_allowlist", message: "merchant is not on this pact's allowlist" },
      { status: 400 },
    );
  }
  const capabilityHash = entry.capabilityHash ?? Buffer.alloc(32);

  // Demo-grade hash chain. Replace with full canonical receipt-builder once the
  // streaming pact is wired through the proxy (Wave 6+).
  const slot = await connection.getSlot("confirmed");
  const receiptHash = fastHash("claim:receipt", [pactPubkey.toBase58(), merchantPubkey.toBase58(), slot, parsed.data.purpose]);
  const reasonHash = fastHash("claim:reason", [parsed.data.purpose, slot]);
  const policySnapshotHash = fastHash("claim:policy", [pactPubkey.toBase58(), card.policyVersion, slot]);

  const ix = claimStreamingIxWithAtas({
    agent: facilitator.publicKey,
    feePayer: facilitator.publicKey,
    card: pact.parentCard,
    pact: pactPubkey,
    usdcMint: new PublicKey(getUsdcMint()),
    args: {
      merchantOwner: merchantPubkey,
      capabilityHash,
      receiptHash,
      reasonHash,
      policySnapshotHash,
    },
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = facilitator.publicKey;
  tx.sign(facilitator);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
  } catch (e) {
    return NextResponse.json(
      { error: "claim_submit_failed", message: (e as Error).message },
      { status: 502 },
    );
  }

  // Re-fetch the pact to surface the post-claim state to the caller (claimed_after,
  // max_remaining_after — same shape as the on-chain PactStreamClaimEvent).
  const after = await fetchPact(connection, pactPubkey);
  let claimedAfter = "0";
  let maxRemainingAfter = "0";
  if (after && after.mode.kind === "streaming") {
    claimedAfter = String(after.mode.claimed);
    maxRemainingAfter = String(after.mode.maxTotalLamports - after.mode.claimed);
  }

  return NextResponse.json({
    ok: true,
    signature,
    pact: id,
    merchant: parsed.data.merchant,
    claimed_after: claimedAfter,
    max_remaining_after: maxRemainingAfter,
    message: "Streaming claim settled.",
  });
}
