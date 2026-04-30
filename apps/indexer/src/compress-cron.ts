/**
 * compress-cron — Light Protocol ZK Compression worker.
 *
 * Polls Postgres every COMPRESS_CRON_INTERVAL_MS (default 30 s) for ALLOW
 * receipts whose `compressed_sig IS NULL`, resolves the buyer's wallet via
 * agent_cards.authority_pubkey, and mints 1 unit of the SETTLE_RECEIPT
 * compressed-token mint to that wallet via @lightprotocol/compressed-token.
 *
 * Decoupled from the user-facing payment path on purpose:
 *   - The x402 proxy never blocks on Light Protocol RPC. Receipts persist
 *     immediately; compression is a secondary mirror filled in async.
 *   - Idempotency = the `compressed_sig IS NULL` predicate. Once filled, we
 *     never retry. If the worker dies mid-mint, the row stays NULL → next
 *     tick redoes it.
 *   - Light Protocol RPC failures are non-fatal: a receipt simply remains
 *     "uncompressed" in the UI until the next successful tick.
 *
 * Required env:
 *   SETTLE_ZK_RECEIPT_AUTHORITY_PRIVKEY  base58 64-byte secret (mint authority + payer)
 *   SETTLE_ZK_RECEIPT_MINT               compressed-mint pubkey from `pnpm zk:mint-setup`
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_RPC_URL or HELIUS_API_KEY (Photon-aware RPC)
 *
 * Optional:
 *   COMPRESS_CRON_INTERVAL_MS    default 30000 (30 s)
 *   COMPRESS_CRON_BATCH_SIZE     default 5 — how many to process per tick
 *                                Keep small: each mintTo takes 1-3 s and we
 *                                process them serially to avoid state-tree
 *                                contention against ourselves.
 *   SETTLE_CLUSTER               devnet | mainnet (default devnet)
 *   COMPRESS_CRON_DRY_RUN=1      log candidates but don't mint
 *
 * Run: pnpm --filter @settle/indexer dev:compress-cron
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  loadZkReceiptConfig,
  mintCompressedReceipt,
  type ZkReceiptConfig,
} from "./zk-compression.js";

config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERVAL_MS = Number(process.env.COMPRESS_CRON_INTERVAL_MS ?? 30_000);
const BATCH_SIZE = Math.max(1, Number(process.env.COMPRESS_CRON_BATCH_SIZE ?? 5));
const CLUSTER = (process.env.SETTLE_CLUSTER ?? "devnet") as "devnet" | "mainnet";
const DRY_RUN = process.env.COMPRESS_CRON_DRY_RUN === "1";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[compress-cron] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL ?? process.env.RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) return `https://${CLUSTER}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(CLUSTER === "mainnet" ? "mainnet-beta" : "devnet");
}

const cfg: ZkReceiptConfig | null = loadZkReceiptConfig(getRpcUrl());
if (!cfg) {
  console.error(
    "[compress-cron] SETTLE_ZK_RECEIPT_AUTHORITY_PRIVKEY + SETTLE_ZK_RECEIPT_MINT required.\n" +
      "                Run `pnpm zk:keygen` then `pnpm zk:mint-setup`.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

interface PendingReceipt {
  request_id: string;
  card_pubkey: string;
}

async function findPending(client: SupabaseClient): Promise<PendingReceipt[]> {
  const { data, error } = await client
    .from("receipts")
    .select("request_id, card_pubkey")
    .is("compressed_sig", null)
    .eq("decision", "ALLOW")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    console.warn("[compress-cron] supabase query failed:", error.message);
    return [];
  }
  return (data ?? []) as PendingReceipt[];
}

async function resolveBuyerAuthority(
  client: SupabaseClient,
  cardPubkey: string,
): Promise<string | null> {
  const { data } = await client
    .from("agent_cards")
    .select("authority_pubkey")
    .eq("card_pubkey", cardPubkey)
    .maybeSingle();
  return (data?.authority_pubkey as string | undefined) ?? null;
}

async function processOne(
  client: SupabaseClient,
  receipt: PendingReceipt,
): Promise<void> {
  const buyerAuth = await resolveBuyerAuthority(client, receipt.card_pubkey);
  if (!buyerAuth) {
    console.warn(
      `[compress-cron] ${receipt.request_id.slice(0, 8)}…: no agent_cards row for card ${receipt.card_pubkey.slice(0, 6)}…`,
    );
    return;
  }

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(buyerAuth);
  } catch {
    console.warn(
      `[compress-cron] ${receipt.request_id.slice(0, 8)}…: invalid recipient pubkey`,
    );
    return;
  }

  if (DRY_RUN) {
    console.log(
      `  [dry-run] would mint receipt ${receipt.request_id.slice(0, 8)}… → ${buyerAuth.slice(0, 6)}…`,
    );
    return;
  }

  const result = await mintCompressedReceipt(cfg!, recipient);
  const { error: updErr } = await client
    .from("receipts")
    .update({
      compressed_sig: result.signature,
      compressed_addr: result.mintAddress,
    })
    .eq("request_id", receipt.request_id);

  if (updErr) {
    // The token IS minted on-chain at this point — the only way to recover
    // accounting is to manually backfill compressed_sig. We log loudly.
    console.error(
      `[compress-cron] DB update failed AFTER on-chain mint (${result.signature.slice(0, 12)}…) for ${receipt.request_id}: ${updErr.message}`,
    );
    return;
  }

  console.log(
    `[compress-cron] minted receipt ${receipt.request_id.slice(0, 8)}… → ${buyerAuth.slice(0, 6)}… (sig ${result.signature.slice(0, 12)}…)`,
  );
}

async function tick(): Promise<void> {
  try {
    const pending = await findPending(supabase);
    if (pending.length === 0) return;
    console.log(`[compress-cron] ${pending.length} receipt(s) pending compression`);
    for (const r of pending) {
      try {
        await processOne(supabase, r);
      } catch (e) {
        console.warn(
          `[compress-cron] mint failed for ${r.request_id.slice(0, 8)}…:`,
          (e as Error).message,
        );
      }
    }
  } catch (e) {
    console.warn("[compress-cron] tick failed:", (e as Error).message);
  }
}

console.log(
  `[compress-cron] online · cluster=${CLUSTER} · interval=${INTERVAL_MS}ms · batch=${BATCH_SIZE}${DRY_RUN ? " · DRY-RUN" : ""}`,
);
console.log(`[compress-cron] mint=${cfg.mint.toBase58()} authority=${cfg.authorityKeypair.publicKey.toBase58().slice(0, 6)}…`);

void tick();
setInterval(() => void tick(), INTERVAL_MS);
