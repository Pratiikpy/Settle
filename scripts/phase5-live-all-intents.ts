#!/usr/bin/env tsx
/**
 * Phase 5 LIVE devnet test — ALL 7 intent kinds.
 *
 * Provisions queue/state rows for each of the 7 phase5 intents, drives
 * tick + signer, and asserts a phase5_executions row per intent.
 *
 * Intent kinds (sharing the spend_via_pact dispatch path unless noted):
 *   1. scheduled_send  — scheduled_sends, fired by cadence
 *   2. auto_refill     — auto_refill_queue, when balance < threshold
 *   3. gift_claim      — gift_sends status='claimed' + claim_request_id
 *   4. gift_refund     — gift_sends status='expired'
 *   5. group_spend     — group_spend_requests status='quorum_met'
 *   6. round_up        — round_up_queue status='pending'
 *   7. streaming_claim — streaming_claim_queue (uses claim_streaming ix
 *                        — NOT spend_via_pact. On-chain landing requires
 *                        a streaming pact, which our shared pact ISN'T,
 *                        so this one fires the dispatch but expects an
 *                        on-chain failure. Routing proof only.)
 *
 * All 6 spend_via_pact intents share the same pact + card, drawing
 * 0.05 USDC each. Total budget: 0.30 USDC + 0.10 USDC scheduled_send.
 * Pact must have ≥ 0.40 USDC vault balance going in.
 *
 * Run: pnpm tsx --env-file=apps/web/.env.local scripts/phase5-live-all-intents.ts
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
import { randomUUID } from "node:crypto";

const HOST = process.env.SETTLE_LIVE_TEST_HOST ?? "http://localhost:3000";
const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 3_000;

const CARD_PUBKEY = "6vFisJyJ7NKD1z8NpNommtTeAWeyUYityjXicHRsiMBb";
const PACT_PUBKEY = "4rGHHkWLSCF7Mm2wR59ZtqQJ4AwtjPAcG3KXPY2uGSbv";
const VAULT_USDC_ATA = "D1UdvhztC21wSqGT29zbjGuuQtRLUeCRPVRJv48rpXNd";
const MERCHANT_PUBKEY = "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";
const RELAYER_PUBKEY = "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY";
const TEST_WALLET_PATH = ".test-wallet.json";

// 0.05 USDC per intent fire.
const PER_FIRE = 50_000;

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

interface IntentResult {
  intent_kind: string;
  intent_id: string;
  expected_to_land_onchain: boolean;
  status: string | null;
  signature: string | null;
  error_message: string | null;
  card_delegation_validated?: boolean;
  pact_ready?: boolean;
}

const log: Array<{ step: string; ok: boolean; detail: string }> = [];
function record(step: string, ok: boolean, detail: string) {
  log.push({ step, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${step}: ${detail}`);
}

async function pollExecution(
  sb: SupabaseClient,
  intentKind: string,
  intentId: string,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const { data } = await sb
      .from("phase5_executions")
      .select("*")
      .eq("intent_kind", intentKind)
      .eq("intent_id", intentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

async function main() {
  console.log("=".repeat(70));
  console.log("Phase 5 LIVE devnet test — ALL 7 intent kinds");
  console.log("=".repeat(70));
  console.log(`host: ${HOST}`);
  console.log(`card: ${CARD_PUBKEY}`);
  console.log(`pact: ${PACT_PUBKEY} (${PER_FIRE / 1e6} USDC × 6 fires)`);
  console.log(`merchant: ${MERCHANT_PUBKEY}`);
  console.log("");

  const conn = getRpc();
  const auth = loadAuthority();
  const sb = getSb();
  const ownerPub = auth.publicKey.toBase58();

  // ─── Pre-state ───
  const vaultBefore = await getVaultBalance(conn);
  record(
    "pre_state",
    true,
    `vault=${Number(vaultBefore) / 1e6} USDC`,
  );
  if (vaultBefore < BigInt(PER_FIRE * 6)) {
    record(
      "pre_state",
      false,
      `vault < ${(PER_FIRE * 6) / 1e6} USDC; re-run scripts/e2e-payment-flow.ts to refund`,
    );
    process.exit(2);
  }

  // ─── 0a. Mirror agent_cards row ───
  const slotNow = await conn.getSlot("confirmed");
  const { error: cardErr } = await sb.from("agent_cards").upsert({
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
  if (cardErr) {
    record("mirror_card", false, cardErr.message);
    process.exit(1);
  }
  record("mirror_card", true, "agent_cards row upserted");

  // Reset used_today so daily-cap on-chain check passes (but we can't
  // reset on-chain card state, only DB mirror — the on-chain card was
  // also reset to 0 if last_reset_slot rolled over. For safety, push
  // last_reset_slot to current so on-chain matches our 0).
  await sb
    .from("agent_cards")
    .update({ used_today: 0, last_reset_slot: slotNow })
    .eq("card_pubkey", CARD_PUBKEY);

  // ─── 0b. Mirror pacts row (signer queries pacts.parent_card for
  // round_up + auto_refill) ───
  const { error: pactErr } = await sb.from("pacts").upsert({
    pact_pubkey: PACT_PUBKEY,
    parent_card: CARD_PUBKEY,
    scope_label: "e2e-mirror",
    scope_label_hash: Buffer.alloc(32),
    cap_lamports: 1_000_000,
    spent: 0,
    expiry_slot: slotNow + 1_000_000,
    closed: false,
  });
  if (pactErr) {
    record("mirror_pact", false, pactErr.message);
    process.exit(1);
  }
  record("mirror_pact", true, "pacts row upserted");

  // ─── 0c. Mirror allowlist (merchant + a refund target for gift_refund) ───
  const REFUND_PUBKEY = MERCHANT_PUBKEY; // reuse same merchant as refund target
  const { error: allowErr } = await sb.from("agent_card_allowlist").upsert({
    card_pubkey: CARD_PUBKEY,
    merchant_pubkey: MERCHANT_PUBKEY,
    capability_hash: null,
  });
  if (allowErr) {
    record("mirror_allowlist", false, allowErr.message);
    process.exit(1);
  }
  record("mirror_allowlist", true, "allowlist row upserted");

  // ─── Probe signer ───
  const probe = await curl("/api/cron/phase5-signer");
  if (probe.status !== 200 || probe.body.mode !== "live") {
    record("signer_probe", false, `status=${probe.status} mode=${probe.body.mode}`);
    process.exit(1);
  }
  record("signer_probe", true, `mode=live relayer=${probe.body.relayer_pubkey}`);

  // ═════════════════════════════════════════════════════════════════
  // PROVISION ALL 7 INTENT QUEUE/STATE ROWS
  // ═════════════════════════════════════════════════════════════════

  const intents: IntentResult[] = [];

  // 1. scheduled_send
  {
    const nowMinus1m = new Date(Date.now() - 60_000).toISOString();
    const { data: row, error } = await sb
      .from("scheduled_sends")
      .insert({
        owner_pubkey: ownerPub,
        card_pubkey: CARD_PUBKEY,
        pact_pubkey: PACT_PUBKEY,
        dest_pubkey: MERCHANT_PUBKEY,
        amount_lamports: PER_FIRE,
        cadence: "DAILY",
        time_of_day: "12:00",
        note: "phase5-all-intents",
        enabled: true,
        next_fire_at: nowMinus1m,
      })
      .select()
      .single();
    if (error) {
      record("provision_scheduled_send", false, error.message);
      process.exit(1);
    }
    intents.push({
      intent_kind: "scheduled_send",
      intent_id: row.schedule_id,
      expected_to_land_onchain: true,
      status: null,
      signature: null,
      error_message: null,
    });
    record("provision_scheduled_send", true, `schedule_id=${row.schedule_id}`);
  }

  // 2. auto_refill — needs auto_refill_rules + auto_refill_queue
  {
    const ruleId = randomUUID();
    const { error: ruleErr } = await sb.from("auto_refill_rules").insert({
      rule_id: ruleId,
      card_pubkey: CARD_PUBKEY,
      owner_pubkey: ownerPub,
      threshold_lamports: 1_000_000,
      refill_lamports: PER_FIRE,
      cooldown_seconds: 60,
      enabled: true,
    });
    if (ruleErr) {
      record("provision_auto_refill_rule", false, ruleErr.message);
      process.exit(1);
    }
    const queueId = randomUUID();
    const { error: queueErr } = await sb.from("auto_refill_queue").insert({
      queue_id: queueId,
      rule_id: ruleId,
      owner_pubkey: ownerPub,
      observed_balance_lamports: 100,
      threshold_lamports: 1_000_000,
      refill_lamports: PER_FIRE,
      dest_pubkey: MERCHANT_PUBKEY,
      pact_pubkey: PACT_PUBKEY,
      status: "pending",
    });
    if (queueErr) {
      record("provision_auto_refill_queue", false, queueErr.message);
      process.exit(1);
    }
    intents.push({
      intent_kind: "auto_refill",
      intent_id: queueId,
      expected_to_land_onchain: true,
      status: null,
      signature: null,
      error_message: null,
    });
    record("provision_auto_refill", true, `queue_id=${queueId}`);
  }

  // 3. gift_claim — gift_sends status='claimed' + claim_request_id
  {
    const giftId = randomUUID();
    const { error } = await sb.from("gift_sends").insert({
      gift_id: giftId,
      sender_pubkey: ownerPub,
      recipient_handle: "test-recipient",
      escrow_card: CARD_PUBKEY,
      amount_lamports: PER_FIRE,
      status: "claimed",
      claimer_pubkey: MERCHANT_PUBKEY,
      claim_request_id: randomUUID(),
      pact_pubkey: PACT_PUBKEY,
      refund_pubkey: ownerPub,
    });
    if (error) {
      record("provision_gift_claim", false, error.message);
      process.exit(1);
    }
    intents.push({
      intent_kind: "gift_claim",
      intent_id: giftId,
      expected_to_land_onchain: true,
      status: null,
      signature: null,
      error_message: null,
    });
    record("provision_gift_claim", true, `gift_id=${giftId}`);
  }

  // 4. gift_refund — gift_sends status='expired' (refund target = merchant
  // for allowlist convenience; in production it'd be sender's wallet)
  {
    const giftId = randomUUID();
    const { error } = await sb.from("gift_sends").insert({
      gift_id: giftId,
      sender_pubkey: ownerPub,
      recipient_handle: "test-expired",
      escrow_card: CARD_PUBKEY,
      amount_lamports: PER_FIRE,
      status: "expired",
      pact_pubkey: PACT_PUBKEY,
      refund_pubkey: REFUND_PUBKEY,
      expires_at: new Date(Date.now() - 86400_000).toISOString(),
    });
    if (error) {
      record("provision_gift_refund", false, error.message);
      process.exit(1);
    }
    intents.push({
      intent_kind: "gift_refund",
      intent_id: giftId,
      expected_to_land_onchain: true,
      status: null,
      signature: null,
      error_message: null,
    });
    record("provision_gift_refund", true, `gift_id=${giftId}`);
  }

  // 5. group_spend — needs group_accounts + group_spend_requests
  {
    const groupId = randomUUID();
    const { error: groupErr } = await sb.from("group_accounts").insert({
      group_id: groupId,
      label: "phase5-test-group",
      holding_card: CARD_PUBKEY,
      custodian_pubkey: ownerPub,
      quorum: 1,
      threshold_lamports: 1,
    });
    if (groupErr) {
      record("provision_group_account", false, groupErr.message);
      process.exit(1);
    }
    const requestId = randomUUID();
    const { error: reqErr } = await sb.from("group_spend_requests").insert({
      request_id: requestId,
      group_id: groupId,
      requester_pubkey: ownerPub,
      dest_pubkey: MERCHANT_PUBKEY,
      amount_lamports: PER_FIRE,
      pact_pubkey: PACT_PUBKEY,
      status: "quorum_met",
    });
    if (reqErr) {
      record("provision_group_spend_request", false, reqErr.message);
      process.exit(1);
    }
    intents.push({
      intent_kind: "group_spend",
      intent_id: requestId,
      expected_to_land_onchain: true,
      status: null,
      signature: null,
      error_message: null,
    });
    record("provision_group_spend", true, `request_id=${requestId}`);
  }

  // 6. round_up — needs round_up_rules + round_up_queue
  {
    const ruleId = randomUUID();
    const { error: ruleErr } = await sb
      .from("round_up_rules")
      .upsert(
        {
          rule_id: ruleId,
          owner_pubkey: ownerPub,
          round_to_lamports: 1_000_000,
          dest_pubkey: MERCHANT_PUBKEY,
          enabled: true,
        },
        { onConflict: "owner_pubkey" },
      );
    if (ruleErr) {
      record("provision_round_up_rule", false, ruleErr.message);
      process.exit(1);
    }
    // Re-fetch rule_id since upsert may have collapsed onto existing.
    const { data: existingRule } = await sb
      .from("round_up_rules")
      .select("rule_id")
      .eq("owner_pubkey", ownerPub)
      .maybeSingle();
    const effectiveRuleId = existingRule?.rule_id ?? ruleId;
    const queueId = randomUUID();
    const { error: queueErr } = await sb.from("round_up_queue").insert({
      queue_id: queueId,
      rule_id: effectiveRuleId,
      owner_pubkey: ownerPub,
      triggering_amount_lamports: 100_000,
      delta_lamports: PER_FIRE,
      dest_pubkey: MERCHANT_PUBKEY,
      pact_pubkey: PACT_PUBKEY,
      status: "pending",
    });
    if (queueErr) {
      record("provision_round_up_queue", false, queueErr.message);
      process.exit(1);
    }
    intents.push({
      intent_kind: "round_up",
      intent_id: queueId,
      expected_to_land_onchain: true,
      status: null,
      signature: null,
      error_message: null,
    });
    record("provision_round_up", true, `queue_id=${queueId}`);
  }

  // 7. streaming_claim — uses claim_streaming ix. Our pact ISN'T a
  // streaming pact so the on-chain ix will fail. We accept that —
  // this is a routing proof, not a full landing.
  {
    const queueId = randomUUID();
    const { error } = await sb.from("streaming_claim_queue").insert({
      queue_id: queueId,
      pact_pubkey: PACT_PUBKEY,
      card_pubkey: CARD_PUBKEY,
      merchant_pubkey: MERCHANT_PUBKEY,
      owner_pubkey: ownerPub,
      claimable_lamports: PER_FIRE,
      last_claim_slot_at_enqueue: slotNow,
      status: "pending",
    });
    if (error) {
      record("provision_streaming_claim", false, error.message);
      process.exit(1);
    }
    intents.push({
      intent_kind: "streaming_claim",
      intent_id: queueId,
      expected_to_land_onchain: false, // pact isn't streaming-type
      status: null,
      signature: null,
      error_message: null,
    });
    record("provision_streaming_claim", true, `queue_id=${queueId}`);
  }

  // ═════════════════════════════════════════════════════════════════
  // DRIVE THE CRON LOOP
  // ═════════════════════════════════════════════════════════════════

  const tick = await curl("/api/cron/phase5-tick");
  record(
    "tick",
    tick.status === 200,
    `status=${tick.status} body=${JSON.stringify(tick.body).slice(0, 200)}`,
  );

  const sign = await curl("/api/cron/phase5-signer");
  record(
    "signer",
    sign.status === 200,
    `picked=${sign.body.scheduled_picked} refills=${sign.body.refills_picked} gift_claims=${sign.body.gift_claims_picked} gift_refunds=${sign.body.gift_refunds_picked} executions_logged=${sign.body.executions_logged} errors=${(sign.body.errors ?? []).length}`,
  );
  if (sign.body.errors?.length > 0) {
    console.log(`  signer errors: ${JSON.stringify(sign.body.errors)}`);
  }

  // ─── Poll executions for each intent ───
  for (const it of intents) {
    const exec = await pollExecution(sb, it.intent_kind, it.intent_id);
    if (!exec) {
      record(
        `poll_${it.intent_kind}`,
        false,
        `no execution row found for intent_id=${it.intent_id}`,
      );
      continue;
    }
    it.status = exec.status;
    it.signature = exec.signature;
    it.error_message = exec.error_message;
    it.card_delegation_validated = exec.plan_json?.card_delegation_validated;
    it.pact_ready = exec.plan_json?.pact_ready;
    const ok = it.expected_to_land_onchain
      ? exec.status === "confirmed"
      : exec.status === "failed" || exec.status === "confirmed";
    record(
      `poll_${it.intent_kind}`,
      ok,
      `status=${exec.status} sig=${exec.signature?.slice(0, 20) ?? "(none)"}…${exec.error_message ? ` err=${exec.error_message.slice(0, 80)}` : ""}`,
    );
  }

  // ─── Final report ───
  const vaultAfter = await getVaultBalance(conn);
  console.log("");
  console.log("=".repeat(70));
  console.log("PER-INTENT RESULTS");
  console.log("=".repeat(70));
  for (const it of intents) {
    const indicator = it.expected_to_land_onchain
      ? it.status === "confirmed" ? "✅" : "❌"
      : it.status === "failed" ? "🟡 (routing-only)" : it.status === "confirmed" ? "✅" : "❌";
    console.log(`${indicator} ${it.intent_kind.padEnd(18)} status=${it.status} sig=${it.signature?.slice(0, 20) ?? "(none)"}…`);
    if (it.error_message) console.log(`   error: ${it.error_message.slice(0, 200)}`);
  }
  console.log("");
  console.log(`Vault: ${Number(vaultBefore) / 1e6} → ${Number(vaultAfter) / 1e6} USDC (Δ ${Number(vaultBefore - vaultAfter) / 1e6})`);

  const expectedConfirmed = intents.filter((i) => i.expected_to_land_onchain).length;
  const actualConfirmed = intents.filter((i) => i.status === "confirmed").length;
  const allOk = intents.every((i) =>
    i.expected_to_land_onchain
      ? i.status === "confirmed"
      : i.status === "failed" || i.status === "confirmed",
  );
  console.log(
    `Confirmed: ${actualConfirmed}/${expectedConfirmed} (expected to land on-chain)`,
  );
  console.log(allOk ? "✓ ALL 7 INTENTS PASSED EXPECTATIONS" : "✗ SOME INTENTS FAILED");

  // Persist log
  mkdirSync("logs", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `logs/phase5-all-intents-${stamp}.json`;
  writeFileSync(
    path,
    JSON.stringify(
      {
        host: HOST,
        card: CARD_PUBKEY,
        pact: PACT_PUBKEY,
        merchant: MERCHANT_PUBKEY,
        per_fire_lamports: PER_FIRE,
        vault_before: vaultBefore.toString(),
        vault_after: vaultAfter.toString(),
        signer_response: sign.body,
        intents,
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
