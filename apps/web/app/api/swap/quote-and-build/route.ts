import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  Keypair,
  TransactionInstruction,
  AddressLookupTableAccount,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  getJupiterQuote,
  getJupiterSwapInstructions,
  USDC_MINTS,
  isUsdcMint,
  type JupiterIx,
  type JupiterQuoteResponse,
  JupiterError,
} from "../../../../lib/jupiter";
import { kernelCommit, kernelCommitToRecordReceiptArgs } from "@settle/sdk";
import { recordReceiptIx } from "../../../../lib/anchor-client";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

/**
 * F12 — Pay With Any Token via Jupiter.
 *
 * Three response modes:
 *   • direct_usdc    Input is USDC. We build a standard TransferChecked + Solana Pay
 *                    reference. Works on devnet AND mainnet. No swap.
 *   • jupiter_swap   Input is non-USDC. Jupiter quote + swap-instructions composed
 *                    with a post-swap TransferChecked from buyer's USDC ATA to recipient.
 *                    Works on mainnet ONLY (Jupiter has no devnet liquidity).
 *   • mainnet_only   Input is non-USDC and we're on devnet. Returns a live quote (best
 *                    effort — the Jupiter token list may not include the input mint at
 *                    all) plus a clear "swap activates on mainnet" message. The UI shows
 *                    the quote so the user sees the expected outcome.
 *
 * Honest devnet shape: USDC paths work end-to-end. Multi-token paths show real quotes
 * but defer execution to mainnet. This is what the build plan committed to.
 *
 * Mainnet path uses TransactionMessage v0 + the lookup-table addresses Jupiter returns,
 * which is the standard Jupiter integration pattern.
 */

const Body = z.object({
  from: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  to: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  inputMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  inputAmountAtomic: z.string().regex(/^\d+$/),
  outputMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional(),
  slippageBps: z.number().int().min(1).max(10_000).optional(),
  note: z.string().max(200).optional(),
});

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

function jupiterIxToWeb3Ix(ix: JupiterIx): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

async function fetchLookupTables(
  connection: Connection,
  addresses: string[],
): Promise<AddressLookupTableAccount[]> {
  if (addresses.length === 0) return [];
  const results = await Promise.all(
    addresses.map(async (addr) => {
      const acc = await connection.getAddressLookupTable(new PublicKey(addr));
      return acc.value;
    }),
  );
  return results.filter((a): a is AddressLookupTableAccount => a !== null);
}

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: (e as Error).message },
      { status: 400 },
    );
  }

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet" ? "mainnet" : "devnet";
  const usdcMint = parsed.outputMint ?? USDC_MINTS[cluster];
  const slippageBps = parsed.slippageBps ?? 50;
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  let from: PublicKey;
  let to: PublicKey;
  try {
    from = new PublicKey(parsed.from);
    to = new PublicKey(parsed.to);
  } catch {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Path A: input IS USDC. Direct TransferChecked. Works on any cluster.
  // ─────────────────────────────────────────────────────────────────────────
  if (isUsdcMint(parsed.inputMint, cluster)) {
    const inputUsdcMint = new PublicKey(parsed.inputMint);
    const fromAta = await getAssociatedTokenAddress(inputUsdcMint, from);
    const toAta = await getAssociatedTokenAddress(inputUsdcMint, to);
    const reference = Keypair.generate().publicKey;

    const tx = new Transaction();

    let toAtaExists = true;
    try {
      await getAccount(connection, toAta);
    } catch {
      toAtaExists = false;
    }
    if (!toAtaExists) {
      tx.add(createAssociatedTokenAccountInstruction(from, toAta, to, inputUsdcMint));
    }

    const transferIx = createTransferCheckedInstruction(
      fromAta,
      inputUsdcMint,
      toAta,
      from,
      BigInt(parsed.inputAmountAtomic),
      6,
    );
    transferIx.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
    tx.add(transferIx);

    // Record-receipt attestation. Without this ix, the Settle indexer never
    // sees the send → /api/ledger comes back empty even though the USDC
    // transfer confirmed (the bug Pratiik hit on use-settle.vercel.app:
    // tx 5hU8LStb… moved real $10 USDC but stayed invisible in /receipts).
    //
    // The fee-payer signature already covers this ix (no extra signer).
    // Mirrors what /api/send/build did before this swap-aware route shipped.
    const requestId = randomUUID();
    const purposeText = parsed.note?.trim().length
      ? parsed.note.trim()
      : `direct USDC send: ${(Number(parsed.inputAmountAtomic) / 1_000_000).toFixed(6)} to ${to.toBase58().slice(0, 8)}…`;
    const decisionSlot = await connection.getSlot("confirmed");
    const kernel = kernelCommit({
      kind: "direct_send",
      request_id: requestId,
      amount_lamports: parsed.inputAmountAtomic,
      sender: from.toBase58(),
      recipient: to.toBase58(),
      decision_slot: decisionSlot,
      purpose_text: purposeText,
    });
    try {
      tx.add(
        recordReceiptIx({
          attestor: from,
          args: kernelCommitToRecordReceiptArgs(kernel),
        }),
      );
    } catch (e) {
      // record_receipt build failure (e.g. Settle program not deployed on
      // current cluster) shouldn't crash the send — log and continue with
      // a memo-only attestation. Receipt may not appear in indexed ledger
      // until program deploy is verified.
      console.error("[quote-and-build] recordReceiptIx skipped:", (e as Error).message);
    }

    if (parsed.note && parsed.note.trim().length > 0) {
      const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
      tx.add({
        keys: [],
        programId: memoProgram,
        data: Buffer.from(parsed.note.trim().slice(0, 200), "utf8"),
      });
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = from;

    const txBase64 = Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ).toString("base64");

    // Mirror the kernel commit into Supabase so it's visible in /api/ledger,
    // /api/dashboard, /receipts, the public feed, leaderboards, etc.
    // The on-chain record_receipt ix above creates the canonical anchor;
    // this row is the off-chain index. Without it, /api/ledger comes back
    // empty even though the tx confirmed and the kernel hash is provable.
    //
    // Pre-write at build time (vs. post-confirmation) makes "I sent → I see
    // the receipt" instant. If the tx never lands, this row just stays as a
    // kernel-only record without an on-chain sig. That's an acceptable
    // failure mode — the indexer can later mark stale rows; we'd rather
    // show the user their commit than gate UX on confirmation latency.
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let indexStatus: "indexed" | "skipped_no_supabase" | "rls_blocked" | "failed" = "skipped_no_supabase";
    let indexError: string | null = null;
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
        });
        const nowIso = new Date().toISOString();
        const { error: insertErr } = await sb.from("receipts").insert({
          request_id: requestId,
          card_pubkey: from.toBase58(),
          pact_pubkey: null,
          merchant_pubkey: to.toBase58(),
          amount_lamports: parsed.inputAmountAtomic,
          decision: "ALLOW",
          deny_code: null,
          capability_hash: `\\x${"00".repeat(32)}`,
          purpose_text_hash: `\\x${kernel.hashes.purpose_text_hash}`,
          purpose_hash: `\\x${kernel.hashes.purpose_hash}`,
          receipt_hash: `\\x${kernel.hashes.receipt_hash}`,
          reason_hash: `\\x${kernel.hashes.reason_hash}`,
          policy_snapshot_hash: `\\x${kernel.hashes.policy_snapshot_hash}`,
          target_method: "POST",
          target_path: "/_kernel/direct_send",
          decision_slot: decisionSlot,
          policy_version: 0,
          receipt_kind: "direct_send",
          context_hash: `\\x${kernel.context_hash}`,
          created_at: nowIso,
        });
        if (insertErr) {
          indexStatus = /row-level security|new row violates/i.test(insertErr.message)
            ? "rls_blocked"
            : "failed";
          indexError = insertErr.message;
          console.error("[quote-and-build] receipts insert failed:", insertErr.message);
        } else {
          indexStatus = "indexed";
        }
      } catch (e) {
        indexStatus = "failed";
        indexError = (e as Error).message;
        console.error("[quote-and-build] receipts insert threw:", (e as Error).message);
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "direct_usdc",
      cluster,
      transaction: txBase64,
      blockhash,
      last_valid_block_height: lastValidBlockHeight,
      reference: reference.toBase58(),
      amount_usdc: (Number(parsed.inputAmountAtomic) / 1_000_000).toFixed(6),
      message: `Send $${(Number(parsed.inputAmountAtomic) / 1_000_000).toFixed(2)} USDC.`,
      receipt: {
        request_id: requestId,
        kind: kernel.kind,
        hashes: kernel.hashes,
        context_hash: kernel.context_hash,
      },
      _index: { status: indexStatus, error: indexError },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Non-USDC path. Always try to fetch a quote (informational on devnet).
  // ─────────────────────────────────────────────────────────────────────────
  let quote: JupiterQuoteResponse | null = null;
  let quoteError: string | null = null;
  try {
    quote = await getJupiterQuote({
      inputMint: parsed.inputMint,
      outputMint: usdcMint,
      amount: parsed.inputAmountAtomic,
      slippageBps,
      restrictIntermediateTokens: true,
    });
  } catch (e) {
    quoteError = e instanceof JupiterError ? `${e.status ?? "?"} ${e.message}` : String(e);
  }

  if (cluster === "devnet") {
    return NextResponse.json({
      ok: true,
      mode: "mainnet_only",
      cluster,
      quote: quote
        ? {
            in_amount: quote.inAmount,
            out_amount: quote.outAmount,
            price_impact_pct: quote.priceImpactPct,
            slippage_bps: quote.slippageBps,
            route: quote.routePlan
              .map((r) => r.swapInfo.label)
              .filter((s, i, arr) => arr.indexOf(s) === i)
              .slice(0, 4),
          }
        : null,
      quote_error: quoteError,
      message:
        "Jupiter has no devnet liquidity. Quote is shown for reference only — swap+send activates on mainnet. Pick USDC to send directly on devnet today.",
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mainnet: real swap + post-swap transfer to recipient.
  //
  // Strategy: use Jupiter's destinationTokenAccount param to route swap output directly
  // to the recipient's USDC ATA. Saves an extra transfer ix and avoids the buyer needing
  // their own USDC ATA. Pre-create the recipient ATA in setup if it doesn't exist.
  // ─────────────────────────────────────────────────────────────────────────
  if (!quote) {
    return NextResponse.json(
      { error: "quote_failed", message: quoteError ?? "no_route" },
      { status: 502 },
    );
  }

  const outputMint = new PublicKey(usdcMint);
  const recipientUsdcAta = await getAssociatedTokenAddress(outputMint, to);

  // Check if recipient ATA exists; if not, prepend a CreateATA ix paid by the buyer.
  let recipAtaExists = true;
  try {
    await getAccount(connection, recipientUsdcAta);
  } catch {
    recipAtaExists = false;
  }

  let swapIxs;
  try {
    swapIxs = await getJupiterSwapInstructions({
      quoteResponse: quote,
      userPublicKey: parsed.from,
      destinationTokenAccount: recipientUsdcAta.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "swap_instructions_failed",
        message: e instanceof JupiterError ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  // Build the v0 message with all Jupiter ixs + optional ATA-create + memo + Solana Pay reference
  const reference = Keypair.generate().publicKey;
  const ixs: TransactionInstruction[] = [];

  ixs.push(...swapIxs.computeBudgetInstructions.map(jupiterIxToWeb3Ix));

  if (!recipAtaExists) {
    ixs.push(createAssociatedTokenAccountInstruction(from, recipientUsdcAta, to, outputMint));
  }

  ixs.push(...swapIxs.setupInstructions.map(jupiterIxToWeb3Ix));
  ixs.push(jupiterIxToWeb3Ix(swapIxs.swapInstruction));
  if (swapIxs.cleanupInstruction) {
    ixs.push(jupiterIxToWeb3Ix(swapIxs.cleanupInstruction));
  }

  // Solana Pay reference — append a no-op memo carrying the reference pubkey so the
  // recipient can locate the tx via getSignaturesForAddress(reference).
  const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  ixs.push({
    keys: [{ pubkey: reference, isSigner: false, isWritable: false }],
    programId: memoProgram,
    data: Buffer.from(
      `settle:swap:${quote.inAmount}:${quote.outAmount}${parsed.note ? `:${parsed.note.slice(0, 60)}` : ""}`,
      "utf8",
    ),
  });

  const lookupTables = await fetchLookupTables(connection, swapIxs.addressLookupTableAddresses);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: from,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message(lookupTables);

  const versionedTx = new VersionedTransaction(message);
  const txBase64 = Buffer.from(versionedTx.serialize()).toString("base64");

  return NextResponse.json({
    ok: true,
    mode: "jupiter_swap",
    cluster,
    transaction: txBase64,
    is_versioned: true,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    quote: {
      in_amount: quote.inAmount,
      out_amount: quote.outAmount,
      price_impact_pct: quote.priceImpactPct,
      slippage_bps: quote.slippageBps,
      route: quote.routePlan
        .map((r) => r.swapInfo.label)
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .slice(0, 4),
    },
    reference: reference.toBase58(),
    message: "Sign to swap + send in one tx.",
  });
}
