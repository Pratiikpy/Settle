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
 * F20 — Build the buyer's collab payment tx.
 *
 *   POST /api/collabs/[id]/pay
 *   body: { from: pubkey, amount_lamports: string }
 *
 * Returns an unsigned tx that contains TWO TransferChecked ixs in one transaction:
 *   ix 1: amount * ratio_bps_a / 10000   →  creator_a's USDC ATA
 *   ix 2: amount - ix1.amount             →  creator_b's USDC ATA
 *
 * Atomic by virtue of being a single Solana tx — both creators get paid or neither
 * does. No transfer-hook or split-pact primitive needed for V1.
 *
 * If either creator's USDC ATA doesn't exist, a CreateATA ix is prepended (buyer pays
 * rent). The buyer's ATA must exist (we don't create it for them — they need USDC to
 * spend in the first place).
 */

const Body = z.object({
  from: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  amount_lamports: z.string().regex(/^\d+$/),
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

  const { data: collab, error: cErr } = await supabase
    .from("collabs")
    .select("creator_a_pubkey, creator_b_pubkey, ratio_bps_a, active, label")
    .eq("id", id)
    .maybeSingle();
  if (cErr) {
    return NextResponse.json({ error: "supabase_error", message: cErr.message }, { status: 502 });
  }
  if (!collab) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!collab.active) return NextResponse.json({ error: "collab_inactive" }, { status: 410 });

  const totalLamports = BigInt(body.amount_lamports);
  if (totalLamports <= 0n) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  // Split: ratio_bps_a / 10000. Use integer math to avoid floating-point drift.
  const ratioA = BigInt(collab.ratio_bps_a);
  const partA = (totalLamports * ratioA) / 10_000n;
  const partB = totalLamports - partA;
  if (partA <= 0n || partB <= 0n) {
    return NextResponse.json(
      {
        error: "split_too_small",
        message: "amount × ratio rounds to 0 for one side; use a larger amount.",
      },
      { status: 400 },
    );
  }

  const buyer = new PublicKey(body.from);
  const a = new PublicKey(collab.creator_a_pubkey);
  const b = new PublicKey(collab.creator_b_pubkey);
  const usdcMint = new PublicKey(getUsdcMint());
  const buyerAta = await getAssociatedTokenAddress(usdcMint, buyer);
  const aAta = await getAssociatedTokenAddress(usdcMint, a);
  const bAta = await getAssociatedTokenAddress(usdcMint, b);

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const tx = new Transaction();

  for (const ata of [aAta, bAta]) {
    let exists = true;
    try {
      await getAccount(connection, ata);
    } catch {
      exists = false;
    }
    if (!exists) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          buyer,
          ata,
          ata.equals(aAta) ? a : b,
          usdcMint,
        ),
      );
    }
  }

  // Fresh Solana Pay reference for end-to-end tracking. Embed on the first transfer.
  const reference = Keypair.generate().publicKey;

  const ixA = createTransferCheckedInstruction(buyerAta, usdcMint, aAta, buyer, partA, 6);
  ixA.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  tx.add(ixA);

  const ixB = createTransferCheckedInstruction(buyerAta, usdcMint, bAta, buyer, partB, 6);
  tx.add(ixB);

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
    split: {
      creator_a_lamports: partA.toString(),
      creator_b_lamports: partB.toString(),
      ratio_bps_a: collab.ratio_bps_a,
    },
    message: `Pay ${body.amount_lamports} lamports — split ${collab.ratio_bps_a / 100}% / ${(10000 - collab.ratio_bps_a) / 100}% atomic.`,
  });
}
