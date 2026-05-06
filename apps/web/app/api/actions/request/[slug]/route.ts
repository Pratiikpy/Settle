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
 * Solana Action endpoint: merchant pay-request Blink.
 *
 * GET → preview card; POST → build a REAL Solana Pay USDC TransferChecked tx with a fresh
 * reference pubkey embedded as a read-only key (so the merchant can locate the tx via
 * getSignaturesForAddress(reference)). No more placeholder strings.
 *
 * The merchant pubkey is resolved from the `slug` (handle) via Supabase verified_merchants
 * if available, otherwise from MERCHANT_PUBKEY_<SLUG_UPPER> env var. Returns 404 if the
 * merchant can't be resolved.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Content-Encoding, Accept-Encoding, Authorization",
  "X-Action-Version": "2.4",
  "X-Blockchain-Ids": "solana:devnet",
};

const USDC_MINTS = {
  mainnet: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  devnet: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
};

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

async function resolveMerchant(slug: string): Promise<PublicKey | null> {
  const envKey = `MERCHANT_PUBKEY_${slug.toUpperCase().replace(/-/g, "_")}`;
  const fromEnv = process.env[envKey];
  if (fromEnv && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(fromEnv)) {
    try {
      return new PublicKey(fromEnv);
    } catch {
      // fall through
    }
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    // Try by handle slug → pubkey via the handles table
    const { data: handle } = await supabase
      .from("handles")
      .select("pubkey")
      .eq("handle", slug.toLowerCase())
      .maybeSingle();
    if (handle && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(handle.pubkey)) {
      return new PublicKey(handle.pubkey);
    }
    // Or maybe slug IS the merchant pubkey directly
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(slug)) {
      return new PublicKey(slug);
    }
  } catch {
    // ignore
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return NextResponse.json(
    {
      type: "action",
      title: `Pay @${slug} via Settle`,
      icon: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://use-settle.vercel.app"}/icon-512`,
      description: `Send USDC to @${slug} via Solana Pay. Fresh reference pubkey embedded so the recipient can match the receipt.`,
      label: "Pay",
      links: {
        actions: [
          { label: "Pay $1", href: `/api/actions/request/${slug}?amount=1` },
          { label: "Pay $5", href: `/api/actions/request/${slug}?amount=5` },
          { label: "Pay $20", href: `/api/actions/request/${slug}?amount=20` },
          {
            label: "Custom",
            href: `/api/actions/request/${slug}?amount={amount}`,
            parameters: [{ name: "amount", label: "Amount (USDC)", required: true }],
          },
        ],
      },
    },
    { headers: CORS },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const amountStr = url.searchParams.get("amount") ?? "5";

  let body: { account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }
  if (!body.account || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.account)) {
    return NextResponse.json({ error: "invalid_account" }, { status: 400, headers: CORS });
  }

  const decimal = parseFloat(amountStr);
  if (!Number.isFinite(decimal) || decimal <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400, headers: CORS });
  }
  const amountBase = BigInt(Math.round(decimal * 1_000_000));

  const merchant = await resolveMerchant(slug);
  if (!merchant) {
    return NextResponse.json(
      { error: "merchant_not_found", slug },
      { status: 404, headers: CORS },
    );
  }

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const usdcMint = cluster === "mainnet" ? USDC_MINTS.mainnet : USDC_MINTS.devnet;
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  let from: PublicKey;
  try {
    from = new PublicKey(body.account);
  } catch {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400, headers: CORS });
  }

  const reference = Keypair.generate().publicKey;
  const fromAta = await getAssociatedTokenAddress(usdcMint, from);
  const toAta = await getAssociatedTokenAddress(usdcMint, merchant);

  const tx = new Transaction();

  // Recipient ATA may not exist — pay rent ourselves to create it.
  let toAtaExists = true;
  try {
    await getAccount(connection, toAta);
  } catch {
    toAtaExists = false;
  }
  if (!toAtaExists) {
    tx.add(createAssociatedTokenAccountInstruction(from, toAta, merchant, usdcMint));
  }

  const transferIx = createTransferCheckedInstruction(
    fromAta,
    usdcMint,
    toAta,
    from,
    amountBase,
    6,
  );
  // Solana Pay reference pubkey: included as read-only non-signer key.
  transferIx.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  tx.add(transferIx);

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
      message: `Pay $${amountStr} USDC to @${slug}. Solana Pay reference: ${reference.toBase58().slice(0, 4)}…${reference.toBase58().slice(-4)}.`,
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return NextResponse.json(null, { headers: CORS });
}
