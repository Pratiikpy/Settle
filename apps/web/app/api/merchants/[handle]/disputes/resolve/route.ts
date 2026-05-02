import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getUsdcMint } from "../../../../../../lib/solana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/merchants/[handle]/disputes/resolve
 *
 * Two flavors:
 *   - decision='approved_refund' → returns an unsigned refund tx
 *     (TransferChecked from merchant USDC ATA → buyer USDC ATA).
 *     The merchant signs in their wallet, submits, and POSTs again
 *     with `refund_signature` set to finalize the row.
 *   - decision='denied' → no on-chain action; just stamps the row
 *     with the merchant's response text.
 *
 * The two-phase approve flow exists because we don't hold the
 * merchant's keys server-side. Build → sign → submit → confirm
 * happens in the wallet; we just record the outcome.
 *
 * Auth: the merchant must be the recipient of the original receipt
 * being disputed — we verify by joining receipts.merchant_pubkey to
 * the handle resolution.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  request_id: z.string().regex(UUID_RE),
  merchant_pubkey: z.string().regex(PUBKEY_RE),
  decision: z.enum(["approved_refund", "denied"]),
  merchant_response: z.string().max(2000).optional(),
  // Phase 2 of approve flow — set after signing + confirming the refund tx.
  refund_signature: z.string().optional(),
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
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }

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
  const v = parsed.data;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Resolve handle → pubkey + verify caller IS the merchant.
  const { data: handleRow } = await sb
    .from("handles")
    .select("pubkey")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (!handleRow) {
    return NextResponse.json({ error: "handle_not_found" }, { status: 404 });
  }
  if (handleRow.pubkey !== v.merchant_pubkey) {
    return NextResponse.json(
      { error: "merchant_mismatch", message: "merchant_pubkey doesn't match @handle" },
      { status: 403 },
    );
  }

  // 2. Load the dispute + verify merchant owns the underlying receipt.
  const { data: dispute } = await sb
    .from("refund_requests")
    .select("id, request_id, authority_pubkey, decision")
    .eq("request_id", v.request_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!dispute) {
    return NextResponse.json({ error: "dispute_not_found" }, { status: 404 });
  }
  if (dispute.decision !== "pending") {
    return NextResponse.json(
      { error: "already_resolved", decision: dispute.decision },
      { status: 409 },
    );
  }

  const { data: receipt } = await sb
    .from("receipts")
    .select("request_id, merchant_pubkey, amount_lamports")
    .eq("request_id", v.request_id)
    .maybeSingle();
  if (!receipt || receipt.merchant_pubkey !== v.merchant_pubkey) {
    return NextResponse.json(
      { error: "receipt_not_yours" },
      { status: 403 },
    );
  }

  // ─── DENY path: just stamp the row. No on-chain action. ───
  if (v.decision === "denied") {
    const { error } = await sb
      .from("refund_requests")
      .update({
        decision: "denied",
        decided_at: new Date().toISOString(),
        merchant_response: v.merchant_response ?? null,
      })
      .eq("id", dispute.id)
      .eq("decision", "pending");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, decision: "denied" });
  }

  // ─── APPROVE path: two-phase. ───
  // Phase 2: caller already has the on-chain signature.
  if (v.refund_signature) {
    const { error } = await sb
      .from("refund_requests")
      .update({
        decision: "approved_refund",
        decided_at: new Date().toISOString(),
        merchant_response: v.merchant_response ?? null,
        refund_signature: v.refund_signature,
      })
      .eq("id", dispute.id)
      .eq("decision", "pending");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      decision: "approved_refund",
      signature: v.refund_signature,
    });
  }

  // Phase 1: build + return the unsigned refund tx.
  const merchant = new PublicKey(v.merchant_pubkey);
  const buyer = new PublicKey(dispute.authority_pubkey);
  const usdcMint = new PublicKey(getUsdcMint());

  const merchantUsdc = getAssociatedTokenAddressSync(usdcMint, merchant);
  const buyerUsdc = getAssociatedTokenAddressSync(usdcMint, buyer);

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  const tx = new Transaction();

  // Create buyer's USDC ATA if missing — devnet wallets often don't
  // have one yet. Cost paid by the merchant; trivial vs. the refund.
  const buyerAtaInfo = await connection.getAccountInfo(buyerUsdc);
  if (!buyerAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        merchant,
        buyerUsdc,
        buyer,
        usdcMint,
      ),
    );
  }

  tx.add(
    createTransferCheckedInstruction(
      merchantUsdc,
      usdcMint,
      buyerUsdc,
      merchant,
      BigInt(receipt.amount_lamports),
      6, // USDC decimals
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = merchant;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    phase: "build",
    transaction: txBase64,
    amount_lamports: receipt.amount_lamports,
    amount_usdc: (Number(receipt.amount_lamports) / 1e6).toFixed(2),
    buyer_pubkey: dispute.authority_pubkey,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: `Refund $${(Number(receipt.amount_lamports) / 1e6).toFixed(2)} USDC to ${dispute.authority_pubkey.slice(0, 6)}…${dispute.authority_pubkey.slice(-4)}. Sign in your wallet, then POST again with refund_signature to finalize.`,
  });
}
