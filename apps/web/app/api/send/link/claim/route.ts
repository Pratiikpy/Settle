import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
  SystemProgram,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";

export const runtime = "nodejs";

/**
 * POST /api/send/link/claim/build
 *   body: { escrow_pubkey: string, recipient: pubkey }
 *
 * Builds an unsigned claim tx that:
 *   1. Creates recipient's USDC ATA if missing (recipient pays rent)
 *   2. Transfers full escrow ATA balance → recipient ATA  (escrow signs)
 *   3. Closes the escrow ATA, refunds rent to recipient    (escrow signs)
 *   4. Drains remaining SOL on the escrow account → recipient (escrow signs)
 *
 * Recipient is the fee payer. Escrow is a co-signer. The client signs both:
 *   - recipient signature comes from the connected Phantom wallet
 *   - escrow signature comes from the URL fragment secret (never sent to server)
 */

const USDC_MINT = {
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

export async function POST(req: NextRequest) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const usdcMint = cluster === "mainnet" ? USDC_MINT.mainnet : USDC_MINT.devnet;

  let body: { escrow_pubkey?: string; recipient?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.escrow_pubkey || !body.recipient) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  let escrow: PublicKey;
  let recipient: PublicKey;
  try {
    escrow = new PublicKey(body.escrow_pubkey);
    recipient = new PublicKey(body.recipient);
  } catch {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const escrowAta = await getAssociatedTokenAddress(usdcMint, escrow);
  const recipientAta = await getAssociatedTokenAddress(usdcMint, recipient);

  // Read the escrow ATA balance to size the transfer correctly.
  let escrowBalance: bigint;
  try {
    const acc = await getAccount(connection, escrowAta);
    escrowBalance = BigInt(acc.amount.toString());
  } catch {
    return NextResponse.json({ error: "escrow_empty_or_not_found" }, { status: 404 });
  }
  if (escrowBalance === 0n) {
    return NextResponse.json({ error: "already_claimed" }, { status: 410 });
  }

  const tx = new Transaction();

  // 1. Create recipient ATA if missing (recipient pays rent)
  let recipAtaExists = true;
  try {
    await getAccount(connection, recipientAta);
  } catch {
    recipAtaExists = false;
  }
  if (!recipAtaExists) {
    tx.add(createAssociatedTokenAccountInstruction(recipient, recipientAta, recipient, usdcMint));
  }

  // 2. Transfer all USDC from escrow → recipient (escrow signs as owner)
  tx.add(createTransferCheckedInstruction(escrowAta, usdcMint, recipientAta, escrow, escrowBalance, 6));

  // 3. Close escrow ATA, refund rent to recipient
  tx.add(createCloseAccountInstruction(escrowAta, recipient, escrow));

  // 4. Drain remaining SOL on the escrow system account → recipient
  //    Read balance, leave 0 (escrow becomes a closed account naturally on next epoch
  //    when balance falls below rent-exempt minimum; cleaner: assign-to-system + transfer-all).
  const escrowLamports = await connection.getBalance(escrow, "confirmed");
  if (escrowLamports > 0) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: escrow,
        toPubkey: recipient,
        lamports: escrowLamports,
      }),
    );
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = recipient;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    transaction: txBase64,
    amount_base: escrowBalance.toString(),
    amount_usdc: (Number(escrowBalance) / 1_000_000).toFixed(6),
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
  });
}
