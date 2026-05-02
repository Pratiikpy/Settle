#!/usr/bin/env tsx
/**
 * Phase 5 LIVE devnet test — scheduled_send intent.
 *
 * Bridges Supabase queue rows to actual on-chain spend_via_pact ix
 * landing via the cron loop. This is the proof of "Phase 5 fires for
 * real" — without it, the cron path is theoretical.
 *
 * Sequence:
 *   1. Reuse the card + pact from e2e-payment-flow (already confirmed).
 *   2. Insert a scheduled_sends row pointing at them, due NOW.
 *   3. POST the row UPDATE so next_fire_at is in the past (tick picks).
 *   4. Hit /api/cron/phase5-tick → marks last_fired_at = now.
 *   5. Hit /api/cron/phase5-signer → dispatches spend_via_pact LIVE.
 *   6. Poll phase5_executions for confirmed=true. Fail if not within 60s.
 *   7. Print all artefacts: tx sig, Solscan URL, vault balance delta.
 *
 * Run: pnpm tsx --env-file=apps/web/.env.local scripts/phase5-live-test.ts
 */
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Keypair,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const HOST = process.env.SETTLE_LIVE_TEST_HOST ?? "http://localhost:3000";
const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 3_000;

// Reuse the card + pact spawned by e2e-payment-flow on prior run.
// They're idempotent: card PDA = (authority, label_hash), pact = (card, scope_hash).
const CARD_PUBKEY = "6vFisJyJ7NKD1z8NpNommtTeAWeyUYityjXicHRsiMBb";
const PACT_PUBKEY = "4rGHHkWLSCF7Mm2wR59ZtqQJ4AwtjPAcG3KXPY2uGSbv";
const VAULT_PUBKEY = "8L6UXKSUYYMtAGsoghNoWjThrAHDNJZhJoExdSLyThBF";
// The vault PDA owns this USDC ATA — what we actually read for balance.
const VAULT_USDC_ATA = "D1UdvhztC21wSqGT29zbjGuuQtRLUeCRPVRJv48rpXNd";
const MERCHANT_PUBKEY = "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";

const TEST_WALLET_PATH = ".test-wallet.json";

function getRpc(): Connection {
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
  const rpc = heliusKey
    ? `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`
    : clusterApiUrl(cluster as "devnet" | "mainnet-beta");
  return new Connection(rpc, "confirmed");
}

function loadAuthority(): Keypair {
  const path = resolve(process.cwd(), TEST_WALLET_PATH);
  if (!existsSync(path)) throw new Error(`No keypair at ${path}`);
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
}

function getSb(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function curl(path: string): Promise<{ status: number; body: any }> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET not set");
  const r = await fetch(`${HOST}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await r.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: r.status, body };
}

async function getVaultBalance(conn: Connection): Promise<bigint> {
  const acc = await getAccount(conn, new PublicKey(VAULT_USDC_ATA), "confirmed");
  return acc.amount;
}

async function getMerchantUsdc(conn: Connection): Promise<bigint> {
  const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const ata = getAssociatedTokenAddressSync(
    usdcMint,
    new PublicKey(MERCHANT_PUBKEY),
  );
  try {
    const acc = await getAccount(conn, ata, "confirmed");
    return acc.amount;
  } catch {
    return 0n;
  }
}

interface LogEntry {
  step: string;
  ok: boolean;
  detail: string;
  data?: unknown;
}

const log: LogEntry[] = [];
function record(step: string, ok: boolean, detail: string, data?: unknown) {
  const e: LogEntry = { step, ok, detail, data };
  log.push(e);
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${step}: ${detail}`);
}

async function main() {
  console.log("=".repeat(70));
  console.log("Phase 5 LIVE devnet test — scheduled_send intent");
  console.log("=".repeat(70));
  console.log(`host: ${HOST}`);
  console.log(`card: ${CARD_PUBKEY}`);
  console.log(`pact: ${PACT_PUBKEY}`);
  console.log(`merchant: ${MERCHANT_PUBKEY}`);
  console.log("");

  const conn = getRpc();
  const auth = loadAuthority();
  const sb = getSb();

  // ─── Pre-state ───
  const vaultBefore = await getVaultBalance(conn);
  const merchantBefore = await getMerchantUsdc(conn);
  record(
    "pre_state",
    true,
    `vault=${Number(vaultBefore) / 1e6} USDC, merchant=${Number(merchantBefore) / 1e6} USDC`,
  );

  if (vaultBefore < 100_000n) {
    record(
      "pre_state",
      false,
      "vault has < 0.1 USDC; cannot fire scheduled spend. Re-run e2e-payment-flow to refund pact.",
    );
    process.exit(2);
  }

  // ─── 0. Mirror agent_cards row to Supabase ───
  // The signer reads agent_cards from the off-chain mirror table normally
  // populated by the indexer. We're not running the indexer in this
  // harness, so we upsert the row directly with the known on-chain
  // values. signer only validates agent_pubkey + revoked at fire-time;
  // the other fields satisfy NOT NULL constraints and reflect actual
  // on-chain state from the create_card we ran in e2e-payment-flow.
  const ownerPub = auth.publicKey.toBase58();
  const RELAYER_PUBKEY = "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY";
  const slotNow = await conn.getSlot("confirmed");
  const { error: cardUpsertErr } = await sb.from("agent_cards").upsert({
    card_pubkey: CARD_PUBKEY,
    authority_pubkey: ownerPub,
    agent_pubkey: RELAYER_PUBKEY,
    label: "e2e-mirror",
    label_hash: Buffer.alloc(32),
    daily_cap_lamports: 5_000_000,
    per_call_max_lamports: 1_000_000,
    used_today: 0,
    last_reset_slot: slotNow,
    expiry_slot: slotNow + 1_000_000,
    policy_version: 1,
    revoked: false,
  });
  if (cardUpsertErr) {
    record("mirror_card", false, cardUpsertErr.message);
    process.exit(1);
  }
  record("mirror_card", true, `card mirrored to agent_cards`);

  // Mirror allowlist row so allowlist gates pass.
  const { error: allowErr } = await sb.from("agent_card_allowlist").upsert({
    card_pubkey: CARD_PUBKEY,
    merchant_pubkey: MERCHANT_PUBKEY,
    capability_hash: null,
  });
  if (allowErr) {
    record("mirror_allowlist", false, allowErr.message);
    process.exit(1);
  }
  record("mirror_allowlist", true, "allowlist row inserted");

  // ─── Probe signer endpoint to confirm live mode ───
  const signerProbe = await curl("/api/cron/phase5-signer");
  if (signerProbe.status !== 200 || signerProbe.body.mode !== "live") {
    record(
      "signer_probe",
      false,
      `expected 200/live, got ${signerProbe.status}/${signerProbe.body.mode}`,
      signerProbe.body,
    );
    process.exit(1);
  }
  record(
    "signer_probe",
    true,
    `mode=${signerProbe.body.mode} relayer=${signerProbe.body.relayer_pubkey}`,
  );

  // ─── 1. Insert scheduled_sends row, due NOW ───
  const amountLamports = 100_000; // 0.1 USDC
  const nowMinus1m = new Date(Date.now() - 60_000).toISOString();
  const { data: schedRow, error: insertErr } = await sb
    .from("scheduled_sends")
    .insert({
      owner_pubkey: ownerPub,
      card_pubkey: CARD_PUBKEY,
      pact_pubkey: PACT_PUBKEY,
      dest_pubkey: MERCHANT_PUBKEY,
      amount_lamports: amountLamports,
      cadence: "DAILY",
      time_of_day: "12:00",
      note: "phase5-live-test",
      enabled: true,
      next_fire_at: nowMinus1m,
    })
    .select()
    .single();
  if (insertErr || !schedRow) {
    record("insert_schedule", false, insertErr?.message ?? "no row", insertErr);
    process.exit(1);
  }
  record(
    "insert_schedule",
    true,
    `schedule_id=${schedRow.schedule_id} amount=${amountLamports} next_fire_at=${nowMinus1m}`,
  );

  // ─── 2. Tick → marks last_fired_at = now ───
  const tick = await curl("/api/cron/phase5-tick");
  if (tick.status !== 200) {
    record("tick", false, `status=${tick.status}`, tick.body);
    process.exit(1);
  }
  record(
    "tick",
    true,
    `schedules_due=${tick.body.schedules_due} refills_due=${tick.body.refills_due}`,
    tick.body,
  );
  if ((tick.body.schedules_due ?? 0) < 1) {
    record(
      "tick",
      false,
      "tick reported 0 schedules_due even though we just inserted one",
    );
    process.exit(1);
  }

  // ─── 3. Signer → dispatches spend_via_pact LIVE ───
  const sign = await curl("/api/cron/phase5-signer");
  if (sign.status !== 200) {
    record("signer", false, `status=${sign.status}`, sign.body);
    process.exit(1);
  }
  record(
    "signer",
    true,
    `mode=${sign.body.mode} picked=${sign.body.scheduled_picked} executions_logged=${sign.body.executions_logged} errors=${(sign.body.errors ?? []).length}`,
    sign.body,
  );

  // ─── 4. Poll phase5_executions for our schedule ───
  const start = Date.now();
  let exec: any = null;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const { data, error } = await sb
      .from("phase5_executions")
      .select("*")
      .eq("intent_kind", "scheduled_send")
      .eq("intent_id", schedRow.schedule_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      record("poll_executions", false, error.message);
      process.exit(1);
    }
    if (data) {
      exec = data;
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!exec) {
    record(
      "poll_executions",
      false,
      `no phase5_executions row in ${POLL_TIMEOUT_MS / 1000}s for schedule_id=${schedRow.schedule_id}`,
    );
    process.exit(1);
  }
  record(
    "poll_executions",
    true,
    `status=${exec.status} mode=${exec.mode} tx_sig=${exec.signature ?? "(none)"}`,
    exec,
  );

  // ─── 5. Verify on-chain vault balance dropped ───
  // Wait briefly for confirmation latency.
  await new Promise((r) => setTimeout(r, 4_000));
  const vaultAfter = await getVaultBalance(conn);
  const merchantAfter = await getMerchantUsdc(conn);
  const vaultDelta = vaultBefore - vaultAfter;
  const merchantDelta = merchantAfter - merchantBefore;
  record(
    "onchain_delta",
    vaultDelta === BigInt(amountLamports) && merchantDelta === BigInt(amountLamports),
    `vault: ${Number(vaultBefore) / 1e6} → ${Number(vaultAfter) / 1e6} (Δ ${Number(vaultDelta) / 1e6}); merchant: ${Number(merchantBefore) / 1e6} → ${Number(merchantAfter) / 1e6} (Δ ${Number(merchantDelta) / 1e6})`,
  );

  // ─── Final report ───
  const allOk = log.every((l) => l.ok);
  console.log("");
  console.log("=".repeat(70));
  console.log(allOk ? "PHASE 5 LIVE TEST PASSED" : "PHASE 5 LIVE TEST FAILED");
  console.log("=".repeat(70));
  if (exec.signature) {
    console.log(
      `Solscan: https://solscan.io/tx/${exec.signature}?cluster=devnet`,
    );
  }

  // Persist log
  mkdirSync("logs", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `logs/phase5-live-${stamp}.json`;
  writeFileSync(
    path,
    JSON.stringify(
      {
        host: HOST,
        card: CARD_PUBKEY,
        pact: PACT_PUBKEY,
        merchant: MERCHANT_PUBKEY,
        schedule_id: schedRow.schedule_id,
        execution: exec,
        log,
      },
      null,
      2,
    ),
  );
  console.log(`log: ${path}`);

  process.exit(allOk ? 0 : 1);
}

void main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
