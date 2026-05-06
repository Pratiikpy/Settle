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
 * F10 â€” One-time-use payment link claim (buyer side).
 *
 *   GET  /api/payment-links/[token]  → public preview (label, amount, creator, claimed?)
 *   POST /api/payment-links/[token]  → buyer pays. Body: { account: <buyer_pubkey> }
 *                                       Server enforces single-use atomically via
 *                                       claimed_at = NULL precondition. Subsequent calls
 *                                       return 410 Gone.
 *
 * Acts as a Solana Pay transaction-request endpoint, so the same /pay/[token] URL works
 * as a Blink in X (per the actions.json mapping).
 *
 * Single-use enforcement (off-chain, atomic): we use Supabase's UPDATE WHERE claimed_at IS
 * NULL pattern. The first request that succeeds in claiming the row gets the tx; all
 * others see "already claimed."
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

interface LinkRow {
  token: string;
  creator_pubkey: string;
  amount_usdc: number;
  label: string;
  description: string | null;
  claimed_at: string | null;
  claimed_by_pubkey: string | null;
  expires_at: string | null;
}

async function fetchLink(token: string): Promise<LinkRow | null> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await supabase
    .from("payment_links")
    .select("token, creator_pubkey, amount_usdc, label, description, claimed_at, claimed_by_pubkey, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  return { ...data, amount_usdc: Number(data.amount_usdc) } as LinkRow;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const row = await fetchLink(token);
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
  }
  const isExpired = row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;
  const isClaimed = row.claimed_at !== null;
  return NextResponse.json(
    {
      label: `Settle Â· ${row.label}`,
      icon: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://use-settle.vercel.app"}/icon-512`,
      title: row.label,
      description:
        row.description ??
        (isClaimed
          ? "This link has already been claimed."
          : isExpired
            ? "This link has expired."
            : `Pay $${row.amount_usdc.toFixed(2)} to ${row.creator_pubkey.slice(0, 6)}â€¦`),
      amount_usdc: row.amount_usdc,
      claimed: isClaimed,
      expired: isExpired,
      creator_pubkey: row.creator_pubkey,
    },
    { headers: CORS },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503, headers: CORS });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  let body: { account?: string };
  try {
    body = (await req.json()) as { account?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }
  if (!body.account || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.account)) {
    return NextResponse.json({ error: "invalid_account" }, { status: 400, headers: CORS });
  }

  // Atomic single-use claim: UPDATE ... WHERE claimed_at IS NULL.
  // The buyer reserves the link by setting claimed_at + claimed_by_pubkey. If two buyers
  // race, only one wins (the WHERE clause makes the second UPDATE affect 0 rows). Then
  // we build the unsigned tx; the buyer's wallet signs and submits.
  // claim_tx_sig is updated separately when the buyer reports settlement (or by an indexer
  // sweep matching the reference pubkey).
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from("payment_links")
    .update({ claimed_at: nowIso, claimed_by_pubkey: body.account })
    .eq("token", token)
    .is("claimed_at", null)
    .select("token, creator_pubkey, amount_usdc, label, expires_at")
    .maybeSingle();

  if (claimErr) {
    return NextResponse.json(
      { error: "supabase_error", message: claimErr.message },
      { status: 502, headers: CORS },
    );
  }
  if (!claimed) {
    // Either not found OR already claimed
    const existing = await fetchLink(token);
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
    }
    return NextResponse.json(
      { error: "already_claimed", claimed_at: existing.claimed_at },
      { status: 410, headers: CORS },
    );
  }

  // Honor expiry; if expired, roll back the claim and return 410.
  if (claimed.expires_at && new Date(claimed.expires_at).getTime() < Date.now()) {
    await supabase
      .from("payment_links")
      .update({ claimed_at: null, claimed_by_pubkey: null })
      .eq("token", token);
    return NextResponse.json({ error: "expired" }, { status: 410, headers: CORS });
  }

  // Build the USDC TransferChecked tx
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const usdcMint = new PublicKey(cluster === "mainnet" ? USDC_MINTS.mainnet : USDC_MINTS.devnet);
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  let from: PublicKey;
  let creator: PublicKey;
  try {
    from = new PublicKey(body.account);
    creator = new PublicKey(claimed.creator_pubkey);
  } catch {
    // Roll back claim
    await supabase
      .from("payment_links")
      .update({ claimed_at: null, claimed_by_pubkey: null })
      .eq("token", token);
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400, headers: CORS });
  }

  const amountBase = BigInt(Math.round(Number(claimed.amount_usdc) * 1_000_000));
  const reference = Keypair.generate().publicKey;
  const fromAta = await getAssociatedTokenAddress(usdcMint, from);
  const toAta = await getAssociatedTokenAddress(usdcMint, creator);

  const tx = new Transaction();

  let toAtaExists = true;
  try {
    await getAccount(connection, toAta);
  } catch {
    toAtaExists = false;
  }
  if (!toAtaExists) {
    tx.add(createAssociatedTokenAccountInstruction(from, toAta, creator, usdcMint));
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

  const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  tx.add({
    keys: [],
    programId: memoProgram,
    data: Buffer.from(`settle:link:${token}`, "utf8"),
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
      message: `Pay $${Number(claimed.amount_usdc).toFixed(2)} USDC for ${claimed.label}.`,
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return NextResponse.json(null, { headers: CORS });
}
