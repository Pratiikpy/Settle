/**
 * Wave 7 / F22 — Permissionless DeliveryEscrow release cron.
 *
 * Polls Supabase for delivery_escrow pacts where:
 *   mode = 'delivery_escrow'
 *   AND released = false
 *   AND refunded = false
 *   AND confirm_deadline_slot <= current_slot
 *
 * For each, calls the web app's /api/escrows/[id]/release endpoint to receive an
 * unsigned tx, signs it with this process's cron keypair, and submits.
 *
 * Why a thin HTTP client instead of building the ix here? The web app already owns
 * the ix builder + the pact-fetch + deadline check logic. Duplicating it would
 * inevitably drift. The cron just needs:
 *   - A Solana keypair (any wallet — it just pays the tx fee)
 *   - The web app's URL
 *   - Supabase access (to find candidates)
 *
 * The merchant pubkey is pinned at open, so the cron CANNOT redirect funds; the
 * worst it can do is move money to the merchant who was always going to get it.
 *
 * Env:
 *   SETTLE_ESCROW_CRON_PRIVKEY  — base58 64-byte secret key (devnet wallet OK)
 *   SETTLE_WEB_BASE             — e.g. https://settle.so or http://localhost:3000
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  — for the candidate query
 *   ESCROW_CRON_INTERVAL_MS     — default 60000 (1 min)
 *   SETTLE_CLUSTER              — devnet | mainnet (default devnet)
 *
 * Run:
 *   pnpm --filter @settle/indexer dev:escrow-cron
 */

import {
  Connection,
  Keypair,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import bs58 from "bs58";
import { config } from "dotenv";

config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_PRIVKEY = process.env.SETTLE_ESCROW_CRON_PRIVKEY;
const WEB_BASE = process.env.SETTLE_WEB_BASE ?? "http://localhost:3000";
const INTERVAL_MS = Number(process.env.ESCROW_CRON_INTERVAL_MS ?? 60_000);
const CLUSTER = (process.env.SETTLE_CLUSTER ?? "devnet") as "devnet" | "mainnet";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[escrow-cron] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}
if (!CRON_PRIVKEY) {
  console.error("[escrow-cron] SETTLE_ESCROW_CRON_PRIVKEY required (base58 secret key)");
  process.exit(1);
}

let cronKeypair: Keypair;
try {
  cronKeypair = Keypair.fromSecretKey(bs58.decode(CRON_PRIVKEY));
} catch (e) {
  console.error("[escrow-cron] failed to decode CRON_PRIVKEY:", (e as Error).message);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL ?? process.env.RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) return `https://${CLUSTER}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(CLUSTER === "mainnet" ? "mainnet-beta" : "devnet");
}

const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

interface PendingEscrowRow {
  pact_pubkey: string;
  confirm_deadline_slot: string | number;
  escrow_merchant_pubkey: string | null;
}

async function findPendingEscrows(currentSlot: bigint): Promise<PendingEscrowRow[]> {
  const { data, error } = await supabase
    .from("pacts")
    .select("pact_pubkey, confirm_deadline_slot, escrow_merchant_pubkey")
    .eq("mode", "delivery_escrow")
    .eq("released", false)
    .eq("refunded", false)
    .lte("confirm_deadline_slot", String(currentSlot));
  if (error) {
    console.warn("[escrow-cron] supabase query failed:", error.message);
    return [];
  }
  return (data ?? []) as PendingEscrowRow[];
}

async function tryReleaseOne(pactPubkey: string): Promise<void> {
  // 1. Ask the web app for an unsigned release tx (it does the on-chain pact fetch +
  //    deadline check + ix build for us).
  const url = `${WEB_BASE}/api/escrows/${encodeURIComponent(pactPubkey)}/release`;
  const buildRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caller: cronKeypair.publicKey.toBase58() }),
  });
  const built = (await buildRes.json()) as
    | {
        ok: true;
        transaction: string;
        blockhash: string;
        last_valid_block_height: number;
        is_buyer_confirmed: boolean;
      }
    | { error: string; message?: string };
  if ("error" in built) {
    // 425 (Too Early) means we polled too eagerly — fine to skip.
    if (built.error === "confirm_deadline_not_passed") {
      return;
    }
    // 409 etc. means another caller (buyer or another cron) already settled it.
    console.warn(
      `[escrow-cron] ${pactPubkey.slice(0, 6)}…: build failed: ${built.message ?? built.error}`,
    );
    return;
  }

  // 2. Sign + submit + confirm.
  const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
  tx.sign(cronKeypair);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    {
      signature: sig,
      blockhash: built.blockhash,
      lastValidBlockHeight: built.last_valid_block_height,
    },
    "confirmed",
  );

  console.log(
    `[escrow-cron] released ${pactPubkey.slice(0, 6)}… → tx ${sig.slice(0, 12)}…`,
  );
}

async function tick(): Promise<void> {
  try {
    const slot = BigInt(await connection.getSlot("confirmed"));
    const pending = await findPendingEscrows(slot);
    if (pending.length === 0) return;
    console.log(`[escrow-cron] found ${pending.length} pending escrows past deadline`);
    // Process serially to keep the cron's wallet from rate-limiting RPC.
    for (const row of pending) {
      try {
        await tryReleaseOne(row.pact_pubkey);
      } catch (e) {
        console.warn(
          `[escrow-cron] error on ${row.pact_pubkey.slice(0, 6)}…:`,
          (e as Error).message,
        );
      }
    }
  } catch (e) {
    console.warn("[escrow-cron] tick failed:", (e as Error).message);
  }
}

console.log(
  `[escrow-cron] online · cluster=${CLUSTER} · interval=${INTERVAL_MS}ms · cron=${cronKeypair.publicKey.toBase58().slice(0, 6)}…`,
);

void tick();
setInterval(() => void tick(), INTERVAL_MS);
