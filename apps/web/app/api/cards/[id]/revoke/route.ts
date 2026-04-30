import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { closePactIx, revokeIx } from "../../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../../lib/solana";

export const runtime = "nodejs";

/**
 * POST /api/cards/[id]/revoke
 * body: {
 *   authority: pubkey,
 *   kind: "card" | "pact",
 * }
 *
 * Builds the revoke or close_pact tx for the authority to sign.
 *
 * For a card: emits revoke ix only.
 * For a pact: emits close_pact ix only.
 *
 * NOTE: A future enhancement bundles `[revoke_card, close_pact, refund_spl]` into a
 * single Jito Bundle for atomic close+refund. That requires the merchant signature
 * on the refund — which is collected off-band. V1 ships the on-chain pieces here and
 * the merchant-signed refund is added by the indexer-driven refund worker once the
 * close_pact event lands.
 */

const BodySchema = z.object({
  authority: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  kind: z.enum(["card", "pact"]),
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
    return NextResponse.json({ error: "invalid_card_id" }, { status: 400 });
  }

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

  const authority = new PublicKey(body.authority);
  const account = new PublicKey(id);

  const usdcMint = new PublicKey(getUsdcMint());
  const ix =
    body.kind === "card"
      ? revokeIx({ authority, card: account })
      : closePactIx({ authority, pact: account, usdcMint });

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
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
    message:
      body.kind === "card"
        ? `Revoke card ${id.slice(0, 6)}…${id.slice(-4)}. Future spends will fail with deny_code 1.`
        : `Close pact ${id.slice(0, 6)}…${id.slice(-4)} and refund unspent USDC on-chain.`,
  });
}
