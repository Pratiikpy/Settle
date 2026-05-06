import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * F9 â€” Self-repricing QR via Solana Pay transaction-request URL.
 *
 * Spec (Solana Pay transaction-request):
 *   GET  â†’ returns { label, icon } describing the action (Phantom shows this in the
 *          confirmation sheet)
 *   POST â†’ wallet posts { account: <buyer_pubkey> }, server returns
 *          { transaction: <base64 tx>, message: <human-readable> } with the buyer pre-filled
 *
 * The QR encodes `solana:<this URL>`. Same QR works forever; the merchant edits the price
 * row in `merchant_pricelist` and the next scan picks up the new amount.
 *
 * Public read on the pricelist (no auth needed for buyers); owner-only writes via
 * wallet-sig auth on a separate endpoint (TODO add /api/pricelist/[slug]/save).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Content-Encoding, Accept-Encoding",
};

const USDC_MINTS = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

interface PricelistRow {
  merchant_pubkey: string;
  slug: string;
  label: string;
  amount_usdc: number;
  description: string | null;
  usdc_mint: string | null;
  paused: boolean;
}

async function fetchPricelist(
  merchant: string,
  slug: string,
): Promise<PricelistRow | null> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await supabase
    .from("merchant_pricelist")
    .select("merchant_pubkey, slug, label, amount_usdc, description, usdc_mint, paused")
    .eq("merchant_pubkey", merchant)
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    amount_usdc: Number(data.amount_usdc),
  } as PricelistRow;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ merchant: string; slug: string }> },
) {
  const { merchant, slug } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(merchant)) {
    return NextResponse.json({ error: "invalid_merchant_pubkey" }, { status: 400, headers: CORS });
  }
  const row = await fetchPricelist(merchant, slug);
  if (!row || row.paused) {
    return NextResponse.json({ error: "not_found_or_paused" }, { status: 404, headers: CORS });
  }
  return NextResponse.json(
    {
      label: `Settle Â· ${row.label}`,
      icon: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://use-settle.vercel.app"}/icon-512`,
      // Spec extension fields â€” not all wallets render these but Solana Pay supports
      // arbitrary additional fields and Phantom shows description on the confirm sheet.
      title: row.label,
      description: row.description ?? `Pay $${row.amount_usdc.toFixed(2)} USDC`,
    },
    { headers: CORS },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ merchant: string; slug: string }> },
) {
  const { merchant, slug } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(merchant)) {
    return NextResponse.json({ error: "invalid_merchant_pubkey" }, { status: 400, headers: CORS });
  }
  const row = await fetchPricelist(merchant, slug);
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
  }
  if (row.paused) {
    return NextResponse.json(
      { error: "paused", message: "This QR is currently paused by the merchant." },
      { status: 410, headers: CORS },
    );
  }

  let body: { account?: string };
  try {
    body = (await req.json()) as { account?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }
  if (!body.account || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.account)) {
    return NextResponse.json({ error: "invalid_account" }, { status: 400, headers: CORS });
  }

  let from: PublicKey;
  let merchantKey: PublicKey;
  try {
    from = new PublicKey(body.account);
    merchantKey = new PublicKey(merchant);
  } catch {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400, headers: CORS });
  }

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const usdcMint = new PublicKey(
    row.usdc_mint ?? (cluster === "mainnet" ? USDC_MINTS.mainnet : USDC_MINTS.devnet),
  );
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  const amountBase = BigInt(Math.round(row.amount_usdc * 1_000_000));
  const reference = Keypair.generate().publicKey;
  const fromAta = await getAssociatedTokenAddress(usdcMint, from);
  const toAta = await getAssociatedTokenAddress(usdcMint, merchantKey);

  const tx = new Transaction();

  let toAtaExists = true;
  try {
    await getAccount(connection, toAta);
  } catch {
    toAtaExists = false;
  }
  if (!toAtaExists) {
    tx.add(createAssociatedTokenAccountInstruction(from, toAta, merchantKey, usdcMint));
  }

  const transferIx = createTransferCheckedInstruction(
    fromAta,
    usdcMint,
    toAta,
    from,
    amountBase,
    6,
  );
  transferIx.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  tx.add(transferIx);

  // Memo with merchant + slug for receipt traceability
  const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  tx.add({
    keys: [],
    programId: memoProgram,
    data: Buffer.from(`settle:qr:${slug}:${row.amount_usdc.toFixed(6)}`, "utf8"),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = from;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json(
    {
      transaction: txBase64,
      message: `Pay $${row.amount_usdc.toFixed(2)} USDC for ${row.label}.`,
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return NextResponse.json(null, { headers: CORS });
}
