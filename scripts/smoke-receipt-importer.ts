#!/usr/bin/env tsx
/**
 * Importer smoke test: takes a real devnet tx signature, calls the
 * import endpoint logic directly (not through HTTP since dev server
 * may not be running), and verifies the receipt row landed.
 */
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { kernelCommit } from "../packages/sdk/dist/index.js";
import { randomUUID } from "node:crypto";

const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as
  | "mainnet"
  | "devnet";
const rpc = process.env.HELIUS_API_KEY
  ? `https://${cluster}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : process.env.NEXT_PUBLIC_RPC_URL ??
    clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");

const USDC_MINT_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

interface ParsedTransfer {
  sourceOwner: string;
  destinationOwner: string;
  amount: bigint;
}

function parseTransferAndMemos(
  parsedIxs: Array<Record<string, unknown>>,
): { transfer: ParsedTransfer | null; memos: string[] } {
  const usdcMint = USDC_MINT_DEVNET.toBase58();
  let transfer: ParsedTransfer | null = null;
  const memos: string[] = [];
  for (const ix of parsedIxs) {
    const programId =
      typeof ix.programId === "string"
        ? ix.programId
        : (ix.programId as { toBase58?: () => string } | undefined)?.toBase58?.();
    if (programId === MEMO_PROGRAM_ID.toBase58()) {
      const text = (ix as { parsed?: string }).parsed;
      if (typeof text === "string" && text.length > 0) memos.push(text);
      continue;
    }
    const parsed = ix.parsed as
      | { type?: string; info?: Record<string, unknown> }
      | undefined;
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
          transfer = { sourceOwner, destinationOwner, amount };
        }
      }
    }
  }
  return { transfer, memos };
}

async function main() {
  // Use the tx from our Path A direct_send smoke earlier in the session.
  // We pass it as argv[2] for flexibility.
  const sig =
    process.argv[2] ??
    "4tTsRAG23my5w7JAoDNLwtL8LWy47Hih5vpWHuajohvhXSUDkAcnn7P4uMCnvZgEgcmRrA6WWC4UXJjPyD2aTwCs";
  console.log(`Importing tx: ${sig}\n`);

  const conn = new Connection(rpc, "confirmed");
  const tx = await conn.getParsedTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) {
    console.error("tx not found");
    process.exit(1);
  }

  const allIxs = tx.transaction.message.instructions as unknown as Array<
    Record<string, unknown>
  >;
  const innerIxs = (tx.meta?.innerInstructions ?? []).flatMap(
    (g) => (g.instructions as unknown as Array<Record<string, unknown>>) ?? [],
  );
  const { transfer, memos } = parseTransferAndMemos([...allIxs, ...innerIxs]);

  if (!transfer) {
    console.error("no USDC TransferChecked found in tx");
    process.exit(1);
  }
  console.log(`extracted transfer:`);
  console.log(`  sender:    ${transfer.sourceOwner}`);
  console.log(`  recipient: ${transfer.destinationOwner}`);
  console.log(`  amount:    ${(Number(transfer.amount) / 1e6).toFixed(6)} USDC`);
  console.log(`  memos:     ${memos.length === 0 ? "(none)" : memos.join(" | ")}`);

  // Idempotency check via Supabase before re-inserting.
  const sbUrl = process.env.SUPABASE_URL!;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });

  const { data: existing } = await sb
    .from("receipts")
    .select("request_id, receipt_hash")
    .eq("imported_from_sig", sig)
    .maybeSingle();
  if (existing) {
    console.log(`\n✓ already imported as request_id=${existing.request_id}`);
    return;
  }

  const requestId = randomUUID();
  const decisionSlot = tx.slot ?? (await conn.getSlot("confirmed"));
  const purposeText =
    memos.length > 0
      ? memos.join(" · ")
      : `Imported Solana Pay payment from ${transfer.sourceOwner.slice(0, 6)}…`;

  const kernel = kernelCommit({
    kind: "direct_send",
    request_id: requestId,
    amount_lamports: transfer.amount.toString(),
    sender: transfer.sourceOwner,
    recipient: transfer.destinationOwner,
    decision_slot: decisionSlot,
    purpose_text: purposeText,
  });

  console.log(`\nkernel commit:`);
  console.log(`  receipt_hash: ${kernel.hashes.receipt_hash}`);
  console.log(`  context_hash: ${kernel.context_hash}`);

  const blockTime = tx.blockTime ?? null;
  const importedAt = blockTime
    ? new Date(blockTime * 1000).toISOString()
    : new Date().toISOString();

  const { error } = await sb.from("receipts").insert({
    request_id: requestId,
    card_pubkey: transfer.sourceOwner,
    pact_pubkey: null,
    merchant_pubkey: transfer.destinationOwner,
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
    sig_solscan: sig,
    decision_slot: decisionSlot,
    policy_version: 0,
    receipt_kind: "direct_send",
    context_hash: `\\x${kernel.context_hash}`,
    import_source: "solana_pay",
    imported_from_sig: sig,
    imported_at: importedAt,
    created_at: importedAt,
  });
  if (error) {
    console.error(`\n✗ insert failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`\n✓ imported. request_id=${requestId}`);
  console.log(`  /receipts/${requestId}`);
  console.log(`  /verify/${kernel.hashes.receipt_hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
