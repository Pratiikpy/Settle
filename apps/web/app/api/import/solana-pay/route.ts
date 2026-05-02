import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { kernelCommit } from "@settle/sdk";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/import/solana-pay
 * body: { signature: string }
 *
 * F5.11 — Cross-app receipt importer.
 *
 * Mirrors any Solana Pay-style USDC transfer tx into Settle's receipts
 * table so:
 *   - It appears under /verify/<receipt_hash>
 *   - It contributes to the sender + recipient trust scores
 *   - It's searchable + tag-able
 *   - The 4-hash kernel commit is computed (Path B-style: just the hashes,
 *     no on-chain attestation since the tx already happened)
 *
 * What we extract from the tx:
 *   1. SPL TransferChecked of USDC mint (devnet 4zMM…) — sender, recipient, amount
 *   2. Optional Memo program ix → purpose_text
 *   3. Solana Pay reference pubkey → preserved as a tag-equivalent
 *
 * What we DON'T do:
 *   - Re-verify the tx on-chain. We trust Helius's getTransaction. The
 *     tx signature itself is a unique key; double-import is blocked by
 *     the unique partial index from migration 0024.
 *   - Mutate the original tx. Imports are read-only mirrors.
 *
 * Security: this endpoint is public-write. To avoid receipt-spam attacks
 * (someone imports thousands of unrelated txs to inflate someone else's
 * trust score), we:
 *   1. Refuse to import if neither sender nor recipient matches the
 *      caller's pubkey (passed as `caller_pubkey` for now; signed-auth
 *      version is a follow-up).
 *   2. Rate-limit at 10 imports/min per IP (TODO: not yet wired).
 */

const Body = z.object({
  signature: z.string().min(64).max(128),
  caller_pubkey: z
    .string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
});

const USDC_MINT_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const USDC_MINT_MAINNET = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

interface ParsedTransfer {
  sourceOwner: string;
  destinationOwner: string;
  amount: bigint;
  mint: string;
}

interface ParsedTx {
  transfer: ParsedTransfer | null;
  memos: string[];
  /** Map: ATA pubkey → owner wallet pubkey (from createAssociatedTokenAccount ix in this tx). */
  atas: Map<string, string>;
}

/**
 * Walk the parsed instructions of a confirmed tx and pull out:
 *   - The first SPL TransferChecked of a known USDC mint (we only support
 *     USDC for now — extending to other SPL tokens is a future move).
 *   - All memo program ix's as plain text strings.
 *   - ATA-to-wallet map from any createAssociatedTokenAccount ix in this
 *     same tx, so transferChecked's `destination` (an ATA) can be
 *     translated back to a wallet for trust-graph joins.
 */
function parseTransferAndMemos(
  parsedIxs: Array<Record<string, unknown>>,
  cluster: "mainnet" | "devnet",
): ParsedTx {
  const usdcMint =
    cluster === "mainnet" ? USDC_MINT_MAINNET.toBase58() : USDC_MINT_DEVNET.toBase58();
  let transfer: ParsedTransfer | null = null;
  const memos: string[] = [];
  const atas = new Map<string, string>();

  for (const ix of parsedIxs) {
    // programId can be a base58 string (parsed JSON) or a PublicKey object
    // (depending on the web3.js version + RPC backend). Normalize either.
    const programId =
      typeof ix.programId === "string"
        ? ix.programId
        : (ix.programId as { toBase58?: () => string } | undefined)?.toBase58?.();
    const parsed = ix.parsed as
      | { type?: string; info?: Record<string, unknown> }
      | undefined;

    if (programId === MEMO_PROGRAM_ID.toBase58()) {
      const text = (ix as { parsed?: string }).parsed;
      if (typeof text === "string" && text.length > 0) memos.push(text);
      continue;
    }

    // Capture createAssociatedTokenAccount → ATA-to-wallet map.
    if (
      parsed?.type === "create" &&
      parsed.info &&
      typeof (parsed.info as { account?: string }).account === "string" &&
      typeof (parsed.info as { wallet?: string }).wallet === "string"
    ) {
      const info = parsed.info as { account: string; wallet: string };
      atas.set(info.account, info.wallet);
    }

    if (
      programId === TOKEN_PROGRAM_ID.toBase58() &&
      parsed?.type === "transferChecked" &&
      parsed.info
    ) {
      const info = parsed.info as {
        mint?: string;
        source?: string;
        destination?: string;
        authority?: string;
        tokenAmount?: { amount?: string };
      };
      if (info.mint === usdcMint && transfer === null) {
        const sourceOwner = info.authority ?? info.source ?? "";
        const destinationOwner = info.destination ?? "";
        const amount = BigInt(info.tokenAmount?.amount ?? "0");
        if (sourceOwner && destinationOwner && amount > 0n) {
          transfer = { sourceOwner, destinationOwner, amount, mint: usdcMint };
        }
      }
    }
  }
  return { transfer, memos, atas };
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
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  // Idempotency check — if we've already imported this signature, return
  // the existing row so the client UX is "you already imported this".
  const { data: existing } = await sb
    .from("receipts")
    .select("request_id, receipt_hash, imported_at")
    .eq("imported_from_sig", parsed.data.signature)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      request_id: existing.request_id,
      message: "Already imported.",
    });
  }

  // Fetch the tx via JSON-parsed RPC. Without the parsed encoding we'd
  // have to manually decode SPL Token instruction data; with it Helius
  // hands us the transferChecked details pre-extracted.
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as
    | "mainnet"
    | "devnet";
  const conn = new Connection(getRpcUrl(), "confirmed");
  const tx = await conn.getParsedTransaction(parsed.data.signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) {
    return NextResponse.json(
      {
        error: "tx_not_found",
        message:
          "Couldn't locate that signature on " +
          cluster +
          ". Is it on the right cluster?",
      },
      { status: 404 },
    );
  }
  if (tx.meta?.err) {
    return NextResponse.json(
      {
        error: "tx_failed",
        message: "The original tx failed; nothing to import.",
        on_chain_err: tx.meta.err,
      },
      { status: 422 },
    );
  }

  const allIxs = tx.transaction.message.instructions as unknown as Array<
    Record<string, unknown>
  >;
  const innerIxs = (tx.meta?.innerInstructions ?? []).flatMap(
    (g) => (g.instructions as unknown as Array<Record<string, unknown>>) ?? [],
  );
  const { transfer, memos, atas } = parseTransferAndMemos(
    [...allIxs, ...innerIxs],
    cluster,
  );

  if (!transfer) {
    return NextResponse.json(
      {
        error: "no_usdc_transfer_found",
        message:
          "We only import txs that include an SPL TransferChecked of USDC. Multi-asset / non-USDC imports are a future feature.",
      },
      { status: 422 },
    );
  }

  // Authorization: require caller to be either sender or recipient. Stops
  // a stranger from polluting your trust graph with strangers' txs.
  // For the recipient: TransferChecked's `destination` is an ATA, not a
  // wallet pubkey. If the same tx contained a createAssociatedTokenAccount
  // for that ATA, we have the owner wallet. Otherwise we fall back to
  // querying the ATA's owner via getAccountInfo.
  const sender = transfer.sourceOwner;
  let recipient = atas.get(transfer.destinationOwner) ?? transfer.destinationOwner;
  if (recipient === transfer.destinationOwner) {
    // Fall back to RPC lookup of the ATA → owner.
    try {
      const info = await conn.getParsedAccountInfo(
        new PublicKey(transfer.destinationOwner),
        "confirmed",
      );
      const data = info.value?.data as
        | { parsed?: { info?: { owner?: string } } }
        | undefined;
      if (data?.parsed?.info?.owner) recipient = data.parsed.info.owner;
    } catch {
      // Leave recipient as the ATA pubkey — verification still works,
      // trust-graph join will be approximate.
    }
  }
  if (
    parsed.data.caller_pubkey !== sender &&
    parsed.data.caller_pubkey !== recipient
  ) {
    return NextResponse.json(
      {
        error: "not_a_party",
        message:
          "You can only import receipts where you are the sender or the recipient.",
      },
      { status: 403 },
    );
  }

  // Compute a kernel commit for the import. We use kind='direct_send' since
  // that's semantically what a Solana Pay tx is — the import_source column
  // distinguishes it from a Settle-native direct send for analytics.
  const requestId = randomUUID();
  const decisionSlot = tx.slot ?? (await conn.getSlot("confirmed"));
  const purposeText =
    memos.length > 0
      ? memos.join(" · ")
      : `Imported Solana Pay payment from ${sender.slice(0, 6)}…`;

  const kernel = kernelCommit({
    kind: "direct_send",
    request_id: requestId,
    amount_lamports: transfer.amount.toString(),
    sender,
    recipient,
    decision_slot: decisionSlot,
    purpose_text: purposeText,
  });

  // Best-effort insert. Pre-import-0024 callers will fail on the column;
  // we surface the error message so it's clear what to fix.
  const blockTime = tx.blockTime ?? null;
  const importedAt = blockTime
    ? new Date(blockTime * 1000).toISOString()
    : new Date().toISOString();

  const { error: insertErr } = await sb.from("receipts").insert({
    request_id: requestId,
    card_pubkey: sender, // for direct_send the sender stands in as card_pubkey (see kernel.canonical.receipt)
    pact_pubkey: null,
    merchant_pubkey: recipient,
    amount_lamports: transfer.amount.toString(),
    decision: "ALLOW",
    deny_code: null,
    capability_hash: `\\x${"00".repeat(32)}`,
    purpose_text_hash: `\\x${kernel.hashes.purpose_text_hash}`,
    purpose_hash: `\\x${kernel.hashes.purpose_hash}`,
    receipt_hash: `\\x${kernel.hashes.receipt_hash}`,
    reason_hash: `\\x${kernel.hashes.reason_hash}`,
    policy_snapshot_hash: `\\x${kernel.hashes.policy_snapshot_hash}`,
    target_method: "POST",
    target_path: `/_kernel/direct_send`,
    sig_solscan: parsed.data.signature,
    decision_slot: decisionSlot,
    policy_version: 0,
    receipt_kind: "direct_send",
    context_hash: `\\x${kernel.context_hash}`,
    import_source: "solana_pay",
    imported_from_sig: parsed.data.signature,
    imported_at: importedAt,
    created_at: importedAt,
  });
  if (insertErr) {
    return NextResponse.json(
      { error: "insert_failed", message: insertErr.message },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    request_id: requestId,
    receipt_hash: kernel.hashes.receipt_hash,
    context_hash: kernel.context_hash,
    sender,
    recipient,
    amount_lamports: transfer.amount.toString(),
    memos,
    imported_at: importedAt,
  });
}
