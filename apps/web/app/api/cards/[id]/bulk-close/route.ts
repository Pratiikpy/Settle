import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { z } from "zod";
import { closePactIx } from "../../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../../lib/solana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cards/[id]/bulk-close
 *
 * body: { authority, pact_pubkeys: string[] }
 *
 * Builds a single tx with one close_pact ix per supplied pact, all
 * signed once by the authority. Solana tx size cap is ~1232 bytes;
 * each close_pact ix data is just 8 bytes (discriminator-only) plus
 * 7 account refs (~30 bytes each) = ~218 bytes per ix. So one tx
 * fits comfortably up to ~5 pacts. We cap at 6 here as a safety
 * margin; callers needing to close more chunk client-side.
 *
 * Why not multi-tx server-side: a single sign-and-send is far better
 * UX than N popups, AND we don't want partial states (some closed,
 * some not, user thinks all are closed). One atomic tx OR clear
 * "split into batches" guidance.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const Body = z.object({
  authority: z.string().regex(PUBKEY_RE),
  pact_pubkeys: z.array(z.string().regex(PUBKEY_RE)).min(1).max(6),
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
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { authority: authorityB58, pact_pubkeys } = parsed.data;

  const authority = new PublicKey(authorityB58);
  const usdcMint = new PublicKey(getUsdcMint());

  const tx = new Transaction();
  for (const pactB58 of pact_pubkeys) {
    tx.add(
      closePactIx({
        authority,
        pact: new PublicKey(pactB58),
        usdcMint,
      }),
    );
  }

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = authority;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    transaction: txBase64,
    pact_count: pact_pubkeys.length,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: `Close ${pact_pubkeys.length} pacts atomically. Vault USDC refunds to authority's USDC ATA.`,
  });
}
