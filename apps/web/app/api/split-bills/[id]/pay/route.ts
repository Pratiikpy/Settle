import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getUsdcMint } from "../../../../../lib/solana";

export const runtime = "nodejs";

/**
 * F21 — Build a payer's contribution tx for a split bill.
 *
 *   POST /api/split-bills/[id]/pay
 *   body: { from: pubkey }
 *
 * Returns an unsigned tx that:
 *   - Sends `per_payer_lamports` USDC from buyer → organizer's USDC ATA
 *   - Embeds a memo "settle-split:<bill_id>" so the indexer/page can correlate
 *   - Embeds a fresh Solana Pay reference for tracking
 *
 * The matching `confirm` endpoint records the payment row after the buyer's client
 * confirms the on-chain settle.
 */

const Body = z.object({
  from: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
});

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: (e as Error).message },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { data: bill, error } = await supabase
    .from("split_bills")
    .select("organizer_pubkey, per_payer_lamports, n_payers, completed_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (bill.completed_at) {
    return NextResponse.json({ error: "bill_completed" }, { status: 410 });
  }

  // Block double-pay from the same wallet.
  const { count: existingCount } = await supabase
    .from("split_bill_payments")
    .select("id", { count: "exact", head: true })
    .eq("bill_id", id)
    .eq("payer_pubkey", body.from);
  if ((existingCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "already_paid", message: "This wallet has already paid this bill." },
      { status: 409 },
    );
  }

  const buyer = new PublicKey(body.from);
  const organizer = new PublicKey(bill.organizer_pubkey as string);
  const usdcMint = new PublicKey(getUsdcMint());
  const buyerAta = await getAssociatedTokenAddress(usdcMint, buyer);
  const organizerAta = await getAssociatedTokenAddress(usdcMint, organizer);

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const tx = new Transaction();

  let organizerAtaExists = true;
  try {
    await getAccount(connection, organizerAta);
  } catch {
    organizerAtaExists = false;
  }
  if (!organizerAtaExists) {
    tx.add(createAssociatedTokenAccountInstruction(buyer, organizerAta, organizer, usdcMint));
  }

  const reference = Keypair.generate().publicKey;
  const transferIx = createTransferCheckedInstruction(
    buyerAta,
    usdcMint,
    organizerAta,
    buyer,
    BigInt(bill.per_payer_lamports as string | number),
    6,
  );
  transferIx.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  tx.add(transferIx);

  // Memo: ties the on-chain tx to the bill_id for indexing.
  const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  tx.add({
    keys: [],
    programId: memoProgram,
    data: Buffer.from(`settle-split:${id}`, "utf8"),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = buyer;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    transaction: txBase64,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    reference: reference.toBase58(),
    per_payer_lamports: String(bill.per_payer_lamports),
    message: `Pay ${bill.per_payer_lamports} lamports as your share of this bill.`,
  });
}
