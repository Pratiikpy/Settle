#!/usr/bin/env tsx
/**
 * Phase 5 idempotency replay drill.
 *
 * Provisions a single scheduled_send, drives the cron loop, then
 * IMMEDIATELY re-runs the signer and asserts:
 *   1. The second run reports `scheduled_picked: 0` (filtered) OR
 *      writes no NEW phase5_executions row for the same intent_id
 *      with created_at > the original.
 *   2. The on-chain vault balance does NOT drop a second time.
 *
 * If either invariant breaks, the cron retry could double-spend in
 * production — catastrophic for an agent-economy protocol.
 *
 * The dedup logic under test (signer route §1):
 *   .gte("created_at", row.last_fired_at)  // an execution row exists
 *   for this schedule since its last_fired_at advance → skip.
 *
 * Run AFTER `pnpm tsx scripts/e2e-payment-flow.ts` to refund the
 * shared pact vault to ≥ 0.1 USDC.
 *
 * Usage:
 *   pnpm tsx --env-file=apps/web/.env.local scripts/phase5-idempotency-drill.ts
 */
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Keypair,
} from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const HOST = process.env.SETTLE_LIVE_TEST_HOST ?? "http://localhost:3000";
const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;

// Reflects the latest run of scripts/e2e-payment-flow.ts.
// Override via env vars if you re-run e2e and want to point at the
// fresh card+pact:
//   SETTLE_TEST_CARD=... SETTLE_TEST_PACT=... SETTLE_TEST_VAULT_ATA=...
const CARD_PUBKEY =
  process.env.SETTLE_TEST_CARD ?? "2fChXeyiXDyM3pHRefMEGKRfa5WNoeDAP9CKd4XuntEb";
const PACT_PUBKEY =
  process.env.SETTLE_TEST_PACT ?? "AsZdXNy2Wh6wNyP2JTgd8RJ2BqZz7FPdWdH1Pisw3gxm";
const VAULT_USDC_ATA =
  process.env.SETTLE_TEST_VAULT_ATA ?? "8W9fvKbef8LHmCcBWk7k6UWaUhvkVSfQzTiDHvU9K7Xb";
const MERCHANT_PUBKEY = "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";
const RELAYER_PUBKEY = "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY";
const TEST_WALLET_PATH = ".test-wallet.json";

const FIRE_AMOUNT = 100_000; // 0.1 USDC

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

async function pollForExecution(
  sb: SupabaseClient,
  scheduleId: string,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const { data } = await sb
      .from("phase5_executions")
      .select("*")
      .eq("intent_kind", "scheduled_send")
      .eq("intent_id", scheduleId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

async function countExecutions(
  sb: SupabaseClient,
  scheduleId: string,
): Promise<number> {
  const { count } = await sb
    .from("phase5_executions")
    .select("*", { count: "exact", head: true })
    .eq("intent_kind", "scheduled_send")
    .eq("intent_id", scheduleId);
  return count ?? 0;
}

const log: Array<{ step: string; ok: boolean; detail: string }> = [];
function record(step: string, ok: boolean, detail: string) {
  log.push({ step, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${step}: ${detail}`);
}

async function main() {
  console.log("=".repeat(70));
  console.log("Phase 5 idempotency replay drill");
  console.log("=".repeat(70));
  console.log("Hypothesis: re-running the signer immediately after a fire");
  console.log("MUST NOT produce a second on-chain spend or a duplicate row.");
  console.log("");

  const conn = getRpc();
  const auth = loadAuthority();
  const sb = getSb();
  const ownerPub = auth.publicKey.toBase58();

  const vaultBefore = await getVaultBalance(conn);
  record("pre_state", true, `vault=${Number(vaultBefore) / 1e6} USDC`);
  if (vaultBefore < BigInt(FIRE_AMOUNT)) {
    record("pre_state", false, `vault < ${FIRE_AMOUNT / 1e6} USDC; refund pact`);
    process.exit(2);
  }

  // Mirror card + pact + allowlist (idempotent upserts).
  // label_hash MUST be unique per (authority, label_hash) to avoid
  // colliding with prior test-mirror rows. Derive deterministically
  // from CARD_PUBKEY so reruns of this drill are idempotent and
  // don't accumulate dead rows.
  const slotNow = await conn.getSlot("confirmed");
  const labelHash = Buffer.from(
    new PublicKey(CARD_PUBKEY).toBuffer(),
  );
  const { error: cardErr } = await sb
    .from("agent_cards")
    .upsert(
      {
        card_pubkey: CARD_PUBKEY,
        authority_pubkey: ownerPub,
        agent_pubkey: RELAYER_PUBKEY,
        label: `mirror-${CARD_PUBKEY.slice(0, 8)}`,
        label_hash: labelHash,
        daily_cap_lamports: 5_000_000,
        per_call_max_lamports: 1_000_000,
        used_today: 0,
        last_reset_slot: slotNow,
        expiry_slot: slotNow + 1_000_000,
        policy_version: 1,
        revoked: false,
      },
      { onConflict: "card_pubkey" },
    );
  if (cardErr) {
    record("mirror_card", false, cardErr.message);
    process.exit(1);
  }
  const { error: pactErr } = await sb
    .from("pacts")
    .upsert(
      {
        pact_pubkey: PACT_PUBKEY,
        parent_card: CARD_PUBKEY,
        scope_label: `mirror-${PACT_PUBKEY.slice(0, 8)}`,
        scope_label_hash: Buffer.from(new PublicKey(PACT_PUBKEY).toBuffer()),
        cap_lamports: 1_000_000,
        spent: 0,
        expiry_slot: slotNow + 1_000_000,
        closed: false,
      },
      { onConflict: "pact_pubkey" },
    );
  if (pactErr) {
    record("mirror_pact", false, pactErr.message);
    process.exit(1);
  }
  const { error: allowErr } = await sb
    .from("agent_card_allowlist")
    .upsert(
      {
        card_pubkey: CARD_PUBKEY,
        merchant_pubkey: MERCHANT_PUBKEY,
        capability_hash: null,
      },
      { onConflict: "card_pubkey,merchant_pubkey" },
    );
  if (allowErr) {
    record("mirror_allowlist", false, allowErr.message);
    process.exit(1);
  }
  record("mirror_state", true, "card + pact + allowlist upserted");

  // ─── Insert a single scheduled_send due NOW ───
  const nowMinus1m = new Date(Date.now() - 60_000).toISOString();
  const { data: schedRow, error } = await sb
    .from("scheduled_sends")
    .insert({
      owner_pubkey: ownerPub,
      card_pubkey: CARD_PUBKEY,
      pact_pubkey: PACT_PUBKEY,
      dest_pubkey: MERCHANT_PUBKEY,
      amount_lamports: FIRE_AMOUNT,
      cadence: "DAILY",
      time_of_day: "12:00",
      note: "idempotency-drill",
      enabled: true,
      next_fire_at: nowMinus1m,
    })
    .select()
    .single();
  if (error || !schedRow) {
    record("provision", false, error?.message ?? "no row");
    process.exit(1);
  }
  const scheduleId = schedRow.schedule_id;
  record("provision", true, `schedule_id=${scheduleId}`);

  // ─── Round 1: tick + signer (the legitimate fire) ───
  const tick1 = await curl("/api/cron/phase5-tick");
  record(
    "tick_round1",
    tick1.status === 200 && (tick1.body.schedules_due ?? 0) > 0,
    `schedules_due=${tick1.body.schedules_due}`,
  );
  const sign1 = await curl("/api/cron/phase5-signer");
  record(
    "signer_round1",
    sign1.status === 200,
    `picked=${sign1.body.scheduled_picked} executions_logged=${sign1.body.executions_logged}`,
  );

  // Wait for the live tx to confirm + audit row to appear.
  const exec1 = await pollForExecution(sb, scheduleId);
  if (!exec1 || exec1.status !== "confirmed") {
    record(
      "round1_landing",
      false,
      `expected confirmed exec; got status=${exec1?.status ?? "(none)"} err=${exec1?.error_message ?? ""}`,
    );
    process.exit(1);
  }
  record(
    "round1_landing",
    true,
    `confirmed sig=${exec1.signature.slice(0, 12)}…`,
  );

  const vaultAfterRound1 = await getVaultBalance(conn);
  const round1Spend = vaultBefore - vaultAfterRound1;
  record(
    "round1_vault",
    round1Spend === BigInt(FIRE_AMOUNT),
    `vault dropped ${Number(round1Spend) / 1e6} USDC (expected ${FIRE_AMOUNT / 1e6})`,
  );

  const round1ExecCount = await countExecutions(sb, scheduleId);
  record(
    "round1_count",
    round1ExecCount === 1,
    `phase5_executions rows for this schedule = ${round1ExecCount}`,
  );

  // ─── Round 2: re-run signer WITHOUT re-ticking ───
  // The dedup check inside the signer §1 should observe the round-1
  // execution row exists (created_at >= last_fired_at) and skip.
  console.log("");
  console.log("--- replay: re-running signer without re-tick ---");
  const sign2 = await curl("/api/cron/phase5-signer");
  record(
    "signer_round2",
    sign2.status === 200,
    `picked=${sign2.body.scheduled_picked} executions_logged=${sign2.body.executions_logged} errors=${(sign2.body.errors ?? []).length}`,
  );

  // ─── Assertion 1: no NEW execution row for this schedule_id ───
  // Brief settle window for any in-flight insert.
  await new Promise((r) => setTimeout(r, 5_000));
  const round2ExecCount = await countExecutions(sb, scheduleId);
  record(
    "no_duplicate_row",
    round2ExecCount === 1,
    round2ExecCount === 1
      ? "still exactly 1 row — dedup held"
      : `❌ DUPLICATE ROW DETECTED: ${round2ExecCount} rows (expected 1)`,
  );

  // ─── Assertion 2: vault balance unchanged from round 1 ───
  const vaultAfterRound2 = await getVaultBalance(conn);
  const round2Spend = vaultAfterRound1 - vaultAfterRound2;
  record(
    "no_double_spend",
    round2Spend === 0n,
    round2Spend === 0n
      ? "vault unchanged after replay — no double spend"
      : `❌ DOUBLE SPEND: vault dropped ${Number(round2Spend) / 1e6} USDC on replay`,
  );

  // ─── Final ───
  const allOk = log.every((l) => l.ok);
  console.log("");
  console.log("=".repeat(70));
  console.log(allOk ? "✓ IDEMPOTENCY DRILL PASSED" : "✗ IDEMPOTENCY DRILL FAILED");
  console.log("=".repeat(70));
  console.log(`Round 1 spend: ${Number(round1Spend) / 1e6} USDC (legitimate)`);
  console.log(`Round 2 spend: ${Number(round2Spend) / 1e6} USDC (must be 0)`);
  console.log(`Total exec rows: ${round2ExecCount} (must be 1)`);
  console.log(`Round 1 sig: ${exec1.signature}`);

  mkdirSync("logs", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `logs/phase5-idempotency-${stamp}.json`;
  writeFileSync(
    path,
    JSON.stringify(
      {
        schedule_id: scheduleId,
        round1: { signer: sign1.body, exec: exec1, vault_after: vaultAfterRound1.toString() },
        round2: {
          signer: sign2.body,
          exec_count: round2ExecCount,
          vault_after: vaultAfterRound2.toString(),
          double_spend_lamports: round2Spend.toString(),
        },
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
