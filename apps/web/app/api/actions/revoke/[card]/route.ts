import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { revokeIx } from "../../../../../lib/anchor-client";

export const runtime = "nodejs";

/**
 * Solana Action endpoint: GET preview + POST builds a real revoke tx for Phantom Blinks.
 * Per Solana Actions spec: POST returns { transaction: <base64>, message: <human-readable> }.
 *
 * No more placeholder transaction strings: this builds the actual `revoke` ix targeting the
 * user's card PDA. Phantom signs in-wallet, submits, and the indexer picks up the
 * PolicyDecisionEvent (decision=2 REVOKE).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Content-Encoding, Accept-Encoding",
};

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ card: string }> },
) {
  const { card } = await params;
  return NextResponse.json(
    {
      type: "action",
      title: "Revoke Settle card",
      icon: "https://settle.so/og/revoke.png",
      description: `Revoke card ${card.slice(0, 4)}…${card.slice(-4)}. Marks the card revoked on-chain. Future spend attempts on this card will fail with deny_code 1.`,
      label: "Revoke now",
      links: {
        actions: [{ label: "Revoke", href: `/api/actions/revoke/${card}` }],
      },
    },
    { headers: CORS },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ card: string }> },
) {
  const { card: cardStr } = await params;

  let body: { account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }
  if (!body.account || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.account)) {
    return NextResponse.json({ error: "invalid_account" }, { status: 400, headers: CORS });
  }

  let card: PublicKey;
  let authority: PublicKey;
  try {
    card = new PublicKey(cardStr);
    authority = new PublicKey(body.account);
  } catch {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400, headers: CORS });
  }

  let ix;
  try {
    ix = revokeIx({ authority, card });
  } catch (e) {
    return NextResponse.json(
      { error: "ix_build_failed", message: (e as Error).message },
      { status: 503, headers: CORS },
    );
  }

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = authority;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json(
    {
      transaction: txBase64,
      message: `Revoke card ${cardStr.slice(0, 4)}…${cardStr.slice(-4)}. The Anchor program will mark it revoked and emit a PolicyDecisionEvent (decision=2). Sign to confirm.`,
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return NextResponse.json(null, { headers: CORS });
}
