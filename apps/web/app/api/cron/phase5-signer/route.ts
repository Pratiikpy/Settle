import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseServiceClient } from "../../../../lib/supabase-server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import bs58 from "bs58";
import { kernelCommit, hexToBytes } from "@settle/sdk";
import {
  claimStreamingIxWithAtas,
  spendViaPactIxWithAtas,
} from "../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../lib/solana";
import { sendPushToPubkey } from "../../../../lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/cron/phase5-signer — Phase 5 relayer signer.
 *
 * The phase5-tick cron writes "intent" rows by setting last_fired_at,
 * claim_request_id, status='expired', etc. THIS endpoint picks those
 * intents up, builds the on-chain ix the intent describes, signs with
 * the relayer keypair, and sends.
 *
 * Two modes, controlled by env:
 *   - SETTLE_RELAYER_LIVE != "true"  → DRY-RUN. We log what we WOULD
 *     send (recipient, amount, ix kind) into phase5_executions with
 *     status='dry_run_logged'. No chain ops.
 *   - SETTLE_RELAYER_LIVE == "true" → LIVE. We sign + send + confirm.
 *
 * The dry-run mode is the default because flipping live for the first
 * time on a multi-user system without first inspecting what the signer
 * sees is asking for trouble. Operators run dry-run for a few cron
 * cycles, eyeball the audit table, then flip live.
 *
 * Auth: Bearer ${CRON_SECRET}, same as phase5-tick.
 *
 * Responsibilities NOT yet implemented (live mode):
 *   - Building the actual TransferChecked / spend_via_pact tx.
 *   - Confirmation polling.
 *   - Retry on transient RPC errors.
 * These land when the operator confirms dry-run output looks right
 * AND has delegated cards to the relayer pubkey on-chain (which is a
 * separate user-action).
 */

interface ExecutionPlan {
  intent_kind:
    | "scheduled_send"
    | "auto_refill"
    | "gift_claim"
    | "gift_refund"
    | "group_spend"
    | "round_up"
    | "streaming_claim";
  intent_id: string;
  ix_kind: string; // 'transfer_checked' | 'spend_via_pact' | 'claim_streaming'
  source_pubkey: string | null;
  dest_pubkey: string | null;
  amount_lamports: string;
  why: string; // human-readable rationale: "scheduled MONTHLY day 1"
  /** Pact PDA the spend_via_pact / claim_streaming tx will use. */
  pact_pubkey?: string | null;
}

interface SignerResult {
  mode: "dry_run" | "live";
  scheduled_picked: number;
  refills_picked: number;
  gift_claims_picked: number;
  gift_refunds_picked: number;
  executions_logged: number;
  errors: string[];
}

/**
 * Service-role only. The signer WRITES to phase5_executions; falling
 * back to anon would silently no-op those writes (AU-09-006 fix).
 * Returns null if env unconfigured so the route can return 503.
 */
function getSb() {
  try {
    return getSupabaseServiceClient();
  } catch {
    return null;
  }
}

/**
 * C94 — push notification dispatch after a successful live fire.
 *
 * Different intent kinds notify different people:
 *   - scheduled_send → just the owner (they set up the rule)
 *   - gift_claim     → BOTH sender (their gift was fulfilled) AND claimer
 *                      (they received funds)
 *   - gift_refund    → just the sender (their unclaimed gift was returned)
 *   - group_spend    → just the requester for now; future: every voter
 *
 * Best-effort: failures don't bubble. The audit row is the source of
 * truth; notifications are a polish layer.
 */
async function notifyPhase5Fire(args: {
  intentKind: "scheduled_send" | "auto_refill" | "gift_claim" | "gift_refund" | "group_spend";
  ownerPubkey: string;
  destPubkey: string;
  amountUsdc: string;
  signature: string;
  intentId: string;
  // Optional second recipient — used for gift_claim where the
  // claimer also wants to know.
  alsoNotify?: string | null;
}) {
  const url = `/audit#exec-${args.intentId.slice(0, 8)}`;
  let title: string;
  let body: string;
  switch (args.intentKind) {
    case "scheduled_send":
      title = "Scheduled send fired";
      body = `$${args.amountUsdc} sent to ${args.destPubkey.slice(0, 6)}…${args.destPubkey.slice(-4)}.`;
      break;
    case "gift_claim":
      title = "Gift fulfilled";
      body = `$${args.amountUsdc} sent to the claimer.`;
      break;
    case "gift_refund":
      title = "Gift refunded";
      body = `$${args.amountUsdc} returned (gift expired unclaimed).`;
      break;
    case "group_spend":
      title = "Group spend confirmed";
      body = `Quorum reached. $${args.amountUsdc} sent.`;
      break;
    default:
      title = "Phase 5 fire";
      body = `$${args.amountUsdc}`;
  }
  const payload = { title, body, url };
  const targets = new Set<string>();
  targets.add(args.ownerPubkey);
  if (args.alsoNotify) targets.add(args.alsoNotify);
  await Promise.all(
    Array.from(targets).map((pk) =>
      sendPushToPubkey(pk, payload).catch(() => ({ sent: 0, failed: 0 })),
    ),
  );
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

/**
 * Build, sign, and send a spend_via_pact tx. Returns the signature
 * + a flag for whether confirmation landed within the timeout +
 * the four kernel hashes we committed to (so the audit row can
 * persist them for receipt verification).
 *
 * Kernel commit: we synthesize an F2.0 receipt of kind=direct_send
 * from the schedule's parameters. The relayer's spend_via_pact ix
 * accepts the four hashes verbatim, so a verifier can later prove:
 *   - This tx was THIS schedule's specific fire (request_id binds it)
 *   - The amount, sender, recipient, slot are unforgeable
 *   - The relayer didn't drift from the user's authorization
 * Capability hash stays zero — the schedule isn't capability-pinned.
 */
async function fireSpendViaPact(args: {
  relayer: Keypair;
  scheduleId: string;
  cardPubkey: string;
  pactPubkey: string;
  ownerPubkey: string;
  destPubkey: string;
  amountLamports: string;
  noteText: string | null;
}): Promise<{
  signature: string;
  confirmed: boolean;
  receiptHashHex: string;
  reasonHashHex: string;
  policySnapshotHashHex: string;
  purposeHashHex: string;
  contextHashHex: string;
}> {
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const usdcMint = new PublicKey(getUsdcMint());
  const decisionSlot = await connection.getSlot("confirmed");

  // Synthesize a kernel commit. The schedule_id is a UUID, which is
  // what the kernel's request_id field expects. Note text falls back
  // to a deterministic stub so purpose_text_hash is never empty (which
  // would mute the binding hash's purpose).
  const purposeText =
    args.noteText && args.noteText.trim().length > 0
      ? args.noteText
      : `phase5 scheduled send #${args.scheduleId.slice(0, 8)}`;

  const commit = kernelCommit({
    kind: "direct_send",
    request_id: args.scheduleId,
    amount_lamports: args.amountLamports,
    sender: args.ownerPubkey,
    recipient: args.destPubkey,
    decision_slot: decisionSlot,
    purpose_text: purposeText,
    decision: "ALLOW",
    deny_code: 0,
  });

  const ix = spendViaPactIxWithAtas({
    agent: args.relayer.publicKey,
    feePayer: args.relayer.publicKey,
    card: new PublicKey(args.cardPubkey),
    pact: new PublicKey(args.pactPubkey),
    usdcMint,
    args: {
      amount: BigInt(args.amountLamports),
      merchantOwner: new PublicKey(args.destPubkey),
      capabilityHash: new Uint8Array(32),
      receiptHash: hexToBytes(commit.hashes.receipt_hash),
      reasonHash: hexToBytes(commit.hashes.reason_hash),
      policySnapshotHash: hexToBytes(commit.hashes.policy_snapshot_hash),
    },
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = args.relayer.publicKey;
  tx.sign(args.relayer);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  // Confirmation: best-effort with a tight timeout. If it doesn't land
  // in time we still return the signature with confirmed=false; the
  // status is `sent` not `confirmed` in that case, and a future audit
  // pass can re-poll.
  let confirmed = false;
  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    confirmed = true;
  } catch {
    confirmed = false;
  }
  return {
    signature,
    confirmed,
    receiptHashHex: commit.hashes.receipt_hash,
    reasonHashHex: commit.hashes.reason_hash,
    policySnapshotHashHex: commit.hashes.policy_snapshot_hash,
    purposeHashHex: commit.hashes.purpose_hash,
    contextHashHex: commit.context_hash,
  };
}

/**
 * C115 — Build, sign, and send a `claim_streaming` tx. Mirrors
 * fireSpendViaPact but uses the claim_streaming ix. Different account
 * order than spend_via_pact (no separate fee_payer slot — the agent
 * IS the fee payer here in the program's design).
 *
 * Kernel commit: synthesizes a kind='streaming_claim' receipt with
 * the queue row's request_id used as the kernel request_id. The 4
 * hashes pass through the ix args same as spend_via_pact, so a
 * verifier can re-derive identically.
 */
async function fireClaimStreaming(args: {
  relayer: Keypair;
  queueId: string;
  cardPubkey: string;
  pactPubkey: string;
  ownerPubkey: string;
  destPubkey: string;
  amountLamports: string;
  noteText: string | null;
  /** Supabase client used to fetch the agent_cards mirror row + count
   * the allowlist for CardContextShape population. */
  sb: SupabaseClient;
  /** From streaming_claim_queue.last_claim_slot_at_enqueue. Used to
   * compute billable_slots = current_slot - this. */
  lastClaimSlotAtEnqueue: number;
}): Promise<{
  signature: string;
  confirmed: boolean;
  receiptHashHex: string;
  reasonHashHex: string;
  policySnapshotHashHex: string;
  purposeHashHex: string;
  contextHashHex: string;
}> {
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const usdcMint = new PublicKey(getUsdcMint());
  const decisionSlot = await connection.getSlot("confirmed");

  // Fetch CardContextShape fields from the agent_cards mirror. The
  // streaming_claim kind requires these on the kernel commit input
  // (unlike direct_send which is unbound to a card).
  const { data: card } = await args.sb
    .from("agent_cards")
    .select(
      "daily_cap_lamports, per_call_max_lamports, expiry_slot, policy_version, revoked, used_today",
    )
    .eq("card_pubkey", args.cardPubkey)
    .maybeSingle();
  if (!card) {
    throw new Error(
      `agent_cards mirror missing for card ${args.cardPubkey.slice(0, 8)}…`,
    );
  }
  const { count: allowlistCount } = await args.sb
    .from("agent_card_allowlist")
    .select("*", { count: "exact", head: true })
    .eq("card_pubkey", args.cardPubkey);

  const dailyCap = BigInt(card.daily_cap_lamports);
  const usedToday = BigInt(card.used_today ?? 0);
  const amount = BigInt(args.amountLamports);
  const remainingRaw = dailyCap - usedToday - amount;
  const capRemainingAfter = remainingRaw < 0n ? "0" : remainingRaw.toString();

  const billableSlots = Math.max(0, decisionSlot - args.lastClaimSlotAtEnqueue);

  const purposeText =
    args.noteText && args.noteText.trim().length > 0
      ? args.noteText
      : `streaming claim from pact ${args.pactPubkey.slice(0, 8)}`;

  const commit = kernelCommit({
    kind: "streaming_claim",
    request_id: args.queueId,
    amount_lamports: args.amountLamports,
    sender: args.ownerPubkey,
    recipient: args.destPubkey,
    decision_slot: decisionSlot,
    purpose_text: purposeText,
    decision: "ALLOW",
    deny_code: 0,
    card_pubkey: args.cardPubkey,
    pact_pubkey: args.pactPubkey,
    capability_hash: "00".repeat(32),
    policy_version: card.policy_version ?? 1,
    daily_cap_lamports: dailyCap.toString(),
    per_call_max_lamports: BigInt(card.per_call_max_lamports).toString(),
    allowlist_count: Math.min(10, allowlistCount ?? 0),
    expiry_slot: Number(card.expiry_slot),
    revoked: Boolean(card.revoked),
    cap_remaining_after: capRemainingAfter,
    billable_slots: billableSlots,
  });

  const ix = claimStreamingIxWithAtas({
    agent: args.relayer.publicKey,
    feePayer: args.relayer.publicKey,
    card: new PublicKey(args.cardPubkey),
    pact: new PublicKey(args.pactPubkey),
    usdcMint,
    args: {
      merchantOwner: new PublicKey(args.destPubkey),
      capabilityHash: new Uint8Array(32),
      receiptHash: hexToBytes(commit.hashes.receipt_hash),
      reasonHash: hexToBytes(commit.hashes.reason_hash),
      policySnapshotHash: hexToBytes(commit.hashes.policy_snapshot_hash),
    },
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = args.relayer.publicKey;
  tx.sign(args.relayer);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  let confirmed = false;
  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    confirmed = true;
  } catch {
    confirmed = false;
  }
  return {
    signature,
    confirmed,
    receiptHashHex: commit.hashes.receipt_hash,
    reasonHashHex: commit.hashes.reason_hash,
    policySnapshotHashHex: commit.hashes.policy_snapshot_hash,
    purposeHashHex: commit.hashes.purpose_hash,
    contextHashHex: commit.context_hash,
  };
}

/**
 * Look at the relayer key. We don't actually need to USE it in dry-run,
 * but we want to fail loudly if the operator turns LIVE on without
 * a key configured. So check at top of every invocation.
 */
function loadRelayer(): { keypair: Keypair | null; pubkey: string | null; error: string | null } {
  const b58 = process.env.SETTLE_RELAYER_PRIVKEY;
  if (!b58) {
    return {
      keypair: null,
      pubkey: null,
      error: "SETTLE_RELAYER_PRIVKEY not set",
    };
  }
  try {
    const kp = Keypair.fromSecretKey(bs58.decode(b58));
    return { keypair: kp, pubkey: kp.publicKey.toBase58(), error: null };
  } catch (e) {
    return {
      keypair: null,
      pubkey: null,
      error: `relayer decode failed: ${(e as Error).message}`,
    };
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const live = process.env.SETTLE_RELAYER_LIVE === "true";
  const mode: "dry_run" | "live" = live ? "live" : "dry_run";

  const relayer = loadRelayer();
  // For live mode, missing key is a hard fail. For dry-run, we just note it.
  if (live && relayer.error) {
    return NextResponse.json(
      {
        error: "relayer_unconfigured_for_live",
        detail: relayer.error,
        hint: "Set SETTLE_RELAYER_PRIVKEY (base58 secret key) before flipping SETTLE_RELAYER_LIVE=true.",
      },
      { status: 503 },
    );
  }

  const result: SignerResult = {
    mode,
    scheduled_picked: 0,
    refills_picked: 0,
    gift_claims_picked: 0,
    gift_refunds_picked: 0,
    executions_logged: 0,
    errors: [],
  };

  const plans: ExecutionPlan[] = [];

  // ─── 1. scheduled_sends recently fired ───
  // Find rows whose last_fired_at is within the last cron interval AND
  // don't yet have an execution row. We use a 15-minute look-back so a
  // skipped cron tick doesn't drop the intent.
  try {
    const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: sched } = await sb
      .from("scheduled_sends")
      .select(
        "schedule_id, owner_pubkey, card_pubkey, pact_pubkey, dest_pubkey, amount_lamports, cadence, day_of_period, last_fired_at",
      )
      .eq("enabled", true)
      .gte("last_fired_at", cutoff)
      .limit(50);

    for (const row of sched ?? []) {
      // Skip if we already have an execution for this fire.
      const { count } = await sb
        .from("phase5_executions")
        .select("*", { count: "exact", head: true })
        .eq("intent_kind", "scheduled_send")
        .eq("intent_id", row.schedule_id)
        .gte("created_at", row.last_fired_at);
      if ((count ?? 0) > 0) continue;
      // Three states:
      //   1. no card_pubkey       → transfer_checked from owner — relayer can't sign
      //   2. card but no pact     → spend_via_pact would need a Pact account
      //   3. card AND pact        → ready to fire spend_via_pact
      // We always queue the plan so missing pieces surface in the audit
      // table loudly. The pre-fire validation later marks the row failed
      // if it's missing card delegation; missing pact gets its own
      // marker so users see exactly which gate failed.
      let ix_kind: string;
      let warning = "";
      if (!row.card_pubkey) {
        ix_kind = "transfer_checked";
        warning = " · WARNING no delegated card";
      } else if (!row.pact_pubkey) {
        ix_kind = "spend_via_pact";
        warning = " · WARNING no pact attached (spawn one on /wishes)";
      } else {
        ix_kind = "spend_via_pact";
      }
      plans.push({
        intent_kind: "scheduled_send",
        intent_id: row.schedule_id,
        ix_kind,
        source_pubkey: row.card_pubkey ?? row.owner_pubkey,
        dest_pubkey: row.dest_pubkey,
        amount_lamports: String(row.amount_lamports),
        why: `scheduled ${row.cadence}${row.day_of_period !== null ? ` day ${row.day_of_period}` : ""}${warning}`,
        // Carry pact_pubkey through to plan_json so the eventual live
        // signer can build spend_via_pact without re-querying.
        pact_pubkey: row.pact_pubkey ?? null,
      });
      result.scheduled_picked += 1;
    }
  } catch (e) {
    result.errors.push(`schedules: ${(e as Error).message}`);
  }

  // ─── 2. (REMOVED — AU-05-001 fix) ───
  // Previously: signer read `auto_refill_rules` directly and built
  // plans alongside the queue-based path (§5a below). This was a
  // double-dispatch hazard: same logical refill could fire twice
  // (once from rule_id, once from queue_id), with different
  // dest_pubkey targets. The auto_refill_queue path (§5a) is now
  // the canonical surface — tick enqueues, signer drains queue.

  // ─── 3. gift_sends with claim_request_id but no execution ───
  try {
    const { data: claims } = await sb
      .from("gift_sends")
      .select(
        "gift_id, escrow_card, claimer_pubkey, amount_lamports, claim_request_id, pact_pubkey, sender_pubkey",
      )
      .eq("status", "claimed")
      .not("claim_request_id", "is", null)
      .limit(50);
    for (const row of claims ?? []) {
      const { count } = await sb
        .from("phase5_executions")
        .select("*", { count: "exact", head: true })
        .eq("intent_kind", "gift_claim")
        .eq("intent_id", row.gift_id);
      if ((count ?? 0) > 0) continue;
      // Same trichotomy as scheduled_send: ix_kind depends on whether
      // the sender already spawned a Pact under escrow_card. Without
      // one the relayer can't fire — escrow_card needs agent=relayer
      // AND a Pact targeting claimer_pubkey.
      const giftIxKind = row.pact_pubkey ? "spend_via_pact" : "transfer_checked";
      const giftWarning = row.pact_pubkey
        ? ""
        : " · WARNING no pact under escrow card (sender must spawn one)";
      plans.push({
        intent_kind: "gift_claim",
        intent_id: row.gift_id,
        ix_kind: giftIxKind,
        source_pubkey: row.escrow_card,
        dest_pubkey: row.claimer_pubkey,
        amount_lamports: String(row.amount_lamports),
        why: `gift claim signed${giftWarning}`,
        pact_pubkey: row.pact_pubkey ?? null,
      });
      result.gift_claims_picked += 1;
    }
  } catch (e) {
    result.errors.push(`gift_claims: ${(e as Error).message}`);
  }

  // ─── 4. gift_sends expired but escrow not yet refunded ───
  try {
    const { data: refunds } = await sb
      .from("gift_sends")
      .select(
        "gift_id, escrow_card, refund_pubkey, amount_lamports, refunded_at, pact_pubkey",
      )
      .eq("status", "expired")
      .limit(50);
    for (const row of refunds ?? []) {
      const { count } = await sb
        .from("phase5_executions")
        .select("*", { count: "exact", head: true })
        .eq("intent_kind", "gift_refund")
        .eq("intent_id", row.gift_id);
      if ((count ?? 0) > 0) continue;
      // Note: refund pacts need refund_pubkey on the allowlist, which
      // the spawn-pact flow may not have included (it usually only
      // adds claimer_pubkey). The on-chain spend will fail if that's
      // the case; the audit row will surface it.
      const refundIxKind = row.pact_pubkey ? "spend_via_pact" : "transfer_checked";
      const refundWarning = row.pact_pubkey
        ? ""
        : " · WARNING no pact (refund needs refund_pubkey on allowlist)";
      plans.push({
        intent_kind: "gift_refund",
        intent_id: row.gift_id,
        ix_kind: refundIxKind,
        source_pubkey: row.escrow_card,
        dest_pubkey: row.refund_pubkey,
        amount_lamports: String(row.amount_lamports),
        why: `gift expired, refund to refund_pubkey${refundWarning}`,
        pact_pubkey: row.pact_pubkey ?? null,
      });
      result.gift_refunds_picked += 1;
    }
  } catch (e) {
    result.errors.push(`gift_refunds: ${(e as Error).message}`);
  }

  // ─── 5a. auto_refill_queue rows at status='pending' ───
  try {
    const { data: refills } = await sb
      .from("auto_refill_queue")
      .select(
        "queue_id, rule_id, owner_pubkey, refill_lamports, dest_pubkey, pact_pubkey",
      )
      .eq("status", "pending")
      .limit(50);
    for (const row of refills ?? []) {
      const { count } = await sb
        .from("phase5_executions")
        .select("*", { count: "exact", head: true })
        .eq("intent_kind", "auto_refill")
        .eq("intent_id", row.queue_id);
      if ((count ?? 0) > 0) continue;
      const { data: pactRow } = await sb
        .from("pacts")
        .select("parent_card")
        .eq("pact_pubkey", row.pact_pubkey)
        .maybeSingle();
      if (!pactRow?.parent_card) {
        result.errors.push(
          `auto_refill ${row.queue_id.slice(0, 8)}: pact ${row.pact_pubkey.slice(0, 8)}… not found`,
        );
        continue;
      }
      plans.push({
        intent_kind: "auto_refill",
        intent_id: row.queue_id,
        ix_kind: "spend_via_pact",
        source_pubkey: pactRow.parent_card,
        dest_pubkey: row.dest_pubkey,
        amount_lamports: row.refill_lamports.toString(),
        why: `auto-refill: ${row.dest_pubkey.slice(0, 6)}… below threshold`,
        pact_pubkey: row.pact_pubkey,
      });
      result.refills_picked += 1;
    }
  } catch (e) {
    result.errors.push(`auto_refill: ${(e as Error).message}`);
  }

  // ─── 5c. streaming_claim_queue rows at status='pending' ───
  // Different ix than spend_via_pact — uses claim_streaming. Same
  // queue-drain shape: read pending, build plan, audit row.
  try {
    const { data: streamingClaims } = await sb
      .from("streaming_claim_queue")
      .select(
        "queue_id, pact_pubkey, card_pubkey, merchant_pubkey, owner_pubkey, claimable_lamports",
      )
      .eq("status", "pending")
      .limit(50);
    for (const row of streamingClaims ?? []) {
      const { count } = await sb
        .from("phase5_executions")
        .select("*", { count: "exact", head: true })
        .eq("intent_kind", "streaming_claim")
        .eq("intent_id", row.queue_id);
      if ((count ?? 0) > 0) continue;
      plans.push({
        intent_kind: "streaming_claim",
        intent_id: row.queue_id,
        ix_kind: "claim_streaming",
        source_pubkey: row.card_pubkey,
        dest_pubkey: row.merchant_pubkey,
        amount_lamports: row.claimable_lamports.toString(),
        why: `streaming claim: ${row.pact_pubkey.slice(0, 8)}…`,
        pact_pubkey: row.pact_pubkey,
      });
      result.scheduled_picked += 1;
    }
  } catch (e) {
    result.errors.push(`streaming_claim: ${(e as Error).message}`);
  }

  // ─── 5b. round_up_queue rows at status='pending' ───
  try {
    const { data: roundUps } = await sb
      .from("round_up_queue")
      .select(
        "queue_id, rule_id, owner_pubkey, delta_lamports, dest_pubkey, pact_pubkey",
      )
      .eq("status", "pending")
      .limit(50);
    for (const row of roundUps ?? []) {
      const { count } = await sb
        .from("phase5_executions")
        .select("*", { count: "exact", head: true })
        .eq("intent_kind", "round_up")
        .eq("intent_id", row.queue_id);
      if ((count ?? 0) > 0) continue;
      // The Pact's parent_card is what we need as source — look it up.
      const { data: pactRow } = await sb
        .from("pacts")
        .select("parent_card")
        .eq("pact_pubkey", row.pact_pubkey)
        .maybeSingle();
      if (!pactRow?.parent_card) {
        result.errors.push(
          `round_up ${row.queue_id.slice(0, 8)}: pact ${row.pact_pubkey.slice(0, 8)}… not found`,
        );
        continue;
      }
      plans.push({
        intent_kind: "round_up",
        intent_id: row.queue_id,
        ix_kind: "spend_via_pact",
        source_pubkey: pactRow.parent_card,
        dest_pubkey: row.dest_pubkey,
        amount_lamports: row.delta_lamports.toString(),
        why: `round-up to nearest from ${row.owner_pubkey.slice(0, 6)}…`,
        pact_pubkey: row.pact_pubkey,
      });
      result.scheduled_picked += 1;
    }
  } catch (e) {
    result.errors.push(`round_up: ${(e as Error).message}`);
  }

  // ─── 5. group_spend_requests at status='quorum_met' ───
  // Read the queue + look up holding_card so the card-delegation gate
  // can validate. We don't write to group_spend_requests here — the
  // signer's role is to fire and audit; the request row's status
  // transitions to 'fired' happen via the indexer attribution path
  // (C43) once ReceiptRecorded is observed for our context_hash.
  try {
    const { data: gsRequests } = await sb
      .from("group_spend_requests")
      .select(
        "request_id, group_id, dest_pubkey, amount_lamports, pact_pubkey, requester_pubkey",
      )
      .eq("status", "quorum_met")
      .limit(50);
    for (const row of gsRequests ?? []) {
      const { count } = await sb
        .from("phase5_executions")
        .select("*", { count: "exact", head: true })
        .eq("intent_kind", "group_spend")
        .eq("intent_id", row.request_id);
      if ((count ?? 0) > 0) continue;
      // Look up the holding_card for this group — that's our source.
      const { data: groupRow } = await sb
        .from("group_accounts")
        .select("holding_card, custodian_pubkey")
        .eq("group_id", row.group_id)
        .maybeSingle();
      if (!groupRow) {
        // Group deleted out from under us — log + skip. (cascade
        // delete of group_accounts removed members but the request
        // table doesn't cascade since we don't FK-reference it.)
        result.errors.push(
          `group_spend ${row.request_id.slice(0, 8)}: group_accounts row missing`,
        );
        continue;
      }
      plans.push({
        intent_kind: "group_spend",
        intent_id: row.request_id,
        ix_kind: "spend_via_pact",
        source_pubkey: groupRow.holding_card,
        dest_pubkey: row.dest_pubkey,
        amount_lamports: row.amount_lamports.toString(),
        why: `group spend, quorum reached, requester ${row.requester_pubkey.slice(0, 6)}…`,
        pact_pubkey: row.pact_pubkey,
      });
      // Re-use a counter — group spends count under "scheduled" picked
      // in the result summary. (Adding a separate counter is cosmetic
      // and not worth the API surface change here.)
      result.scheduled_picked += 1;
    }
  } catch (e) {
    result.errors.push(`group_spend: ${(e as Error).message}`);
  }

  // ─── Log executions (dry-run for now) ───
  // Pre-fetch the agent_pubkey of every card we're about to spend FROM,
  // so we can fail loud if any of them isn't actually delegated to this
  // relayer. Without this check, dry-run rows would lie ("looks signable!")
  // and the first live cycle would generate guaranteed-to-fail tx attempts.
  const sourceCardPubkeys = Array.from(
    new Set(
      plans
        .filter((p) => p.ix_kind === "spend_via_pact")
        .map((p) => p.source_pubkey)
        .filter((s): s is string => !!s),
    ),
  );
  const cardAgentByPubkey = new Map<string, string>();
  if (sourceCardPubkeys.length > 0) {
    const { data: cards } = await sb
      .from("agent_cards")
      .select("card_pubkey, agent_pubkey, revoked")
      .in("card_pubkey", sourceCardPubkeys);
    for (const c of cards ?? []) {
      // Treat revoked cards as not delegated — even if agent matches.
      if (!c.revoked) cardAgentByPubkey.set(c.card_pubkey, c.agent_pubkey);
    }
  }

  // C82.2 — pre-fetch Pact closed-state for every spend_via_pact plan.
  // The user could have manually closed their Pact (recovering unspent
  // USDC) without realizing it was still bound to a schedule. The
  // signer needs to fail loud here rather than let a guaranteed-to-fail
  // on-chain spend attempt go through.
  const sourcePactPubkeys = Array.from(
    new Set(
      plans
        .filter((p) => p.ix_kind === "spend_via_pact" && !!p.pact_pubkey)
        .map((p) => p.pact_pubkey!),
    ),
  );
  const pactClosedByPubkey = new Map<string, boolean>();
  if (sourcePactPubkeys.length > 0) {
    const { data: pactRows } = await sb
      .from("pacts")
      .select("pact_pubkey, closed")
      .in("pact_pubkey", sourcePactPubkeys);
    for (const p of pactRows ?? []) {
      pactClosedByPubkey.set(p.pact_pubkey, Boolean(p.closed));
    }
  }

  for (const plan of plans) {
    let signature: string | null = null;
    let status = mode === "dry_run" ? "dry_run_logged" : "pending";
    let errorMessage: string | null = null;

    // Validate pubkeys we're about to log for sanity (catches schema drift early).
    try {
      if (plan.source_pubkey) new PublicKey(plan.source_pubkey);
      if (plan.dest_pubkey) new PublicKey(plan.dest_pubkey);
    } catch {
      result.errors.push(
        `plan ${plan.intent_kind}/${plan.intent_id}: invalid pubkey — skipping`,
      );
      continue;
    }

    // Card-delegation gate. Only matters for spend_via_pact plans where
    // the relayer must be the on-chain agent of source_pubkey.
    let cardDelegationOk = true;
    if (plan.ix_kind === "spend_via_pact" && plan.source_pubkey) {
      const cardAgent = cardAgentByPubkey.get(plan.source_pubkey);
      if (!cardAgent) {
        cardDelegationOk = false;
        status = "failed";
        errorMessage = `source card ${plan.source_pubkey.slice(0, 8)}… not found or revoked`;
        Sentry.captureMessage(errorMessage, {
          level: "warning",
          tags: { cron: "phase5-signer", gate: "card_delegation_missing", intent_kind: plan.intent_kind },
          extra: { intent_id: plan.intent_id, source_pubkey: plan.source_pubkey },
        });
      } else if (relayer.pubkey && cardAgent !== relayer.pubkey) {
        cardDelegationOk = false;
        status = "failed";
        errorMessage = `card.agent_pubkey (${cardAgent.slice(0, 8)}…) does not match relayer (${relayer.pubkey.slice(0, 8)}…). User must spawn a delegated card via /settings/relayer.`;
        Sentry.captureMessage(errorMessage, {
          level: "warning",
          tags: { cron: "phase5-signer", gate: "card_agent_mismatch", intent_kind: plan.intent_kind },
          extra: { intent_id: plan.intent_id, source_pubkey: plan.source_pubkey, cardAgent, relayer: relayer.pubkey },
        });
      }
    }

    // Pact-presence gate. spend_via_pact requires a Pact account; if
    // the schedule was created without spawning one, fail loud now.
    // C82.2 also gates on the Pact being open — a closed Pact has its
    // vault drained and any spend attempt will revert.
    let pactReady = true;
    if (plan.ix_kind === "spend_via_pact" && cardDelegationOk) {
      if (!plan.pact_pubkey) {
        pactReady = false;
        status = "failed";
        errorMessage =
          "no pact attached. User must click 'Spawn Pact' on /wishes to fund a scoped pact for this rule.";
        Sentry.captureMessage(errorMessage, {
          level: "warning",
          tags: { cron: "phase5-signer", gate: "pact_missing", intent_kind: plan.intent_kind },
          extra: { intent_id: plan.intent_id, source_pubkey: plan.source_pubkey },
        });
      } else {
        const pactClosed = pactClosedByPubkey.get(plan.pact_pubkey);
        // Indexer might be slightly behind; if we've never seen the pact
        // (undefined), assume it's open and let the on-chain spend
        // arbiter. If we know it's closed, fail loud.
        if (pactClosed === true) {
          pactReady = false;
          status = "failed";
          errorMessage = `pact ${plan.pact_pubkey.slice(0, 8)}… is closed. User must click 'Renew Pact' to reopen with a fresh cap.`;
          Sentry.captureMessage(errorMessage, {
            level: "warning",
            tags: { cron: "phase5-signer", gate: "pact_closed", intent_kind: plan.intent_kind },
            extra: { intent_id: plan.intent_id, pact_pubkey: plan.pact_pubkey },
          });
        }
      }
    }

    let firedHashes: {
      receipt_hash: string;
      reason_hash: string;
      policy_snapshot_hash: string;
      purpose_hash: string;
      context_hash: string;
    } | null = null;

    if (mode === "live" && cardDelegationOk && pactReady) {
      // Live mode for spend_via_pact. Six intent kinds share this
      // shape — scheduled_send, gift_claim, gift_refund, group_spend,
      // round_up, auto_refill — they differ only in where we look up
      // the source/owner/note.
      const isLiveSpendable =
        (plan.intent_kind === "scheduled_send" ||
          plan.intent_kind === "gift_claim" ||
          plan.intent_kind === "gift_refund" ||
          plan.intent_kind === "group_spend" ||
          plan.intent_kind === "round_up" ||
          plan.intent_kind === "auto_refill") &&
        plan.ix_kind === "spend_via_pact" &&
        plan.source_pubkey &&
        plan.dest_pubkey &&
        plan.pact_pubkey &&
        relayer.keypair;

      // C115 — streaming_claim uses claim_streaming ix (different
      // discriminator + account order than spend_via_pact). Branch
      // here to fireClaimStreaming instead.
      const isLiveStreamingClaim =
        plan.intent_kind === "streaming_claim" &&
        plan.ix_kind === "claim_streaming" &&
        plan.source_pubkey &&
        plan.dest_pubkey &&
        plan.pact_pubkey &&
        relayer.keypair;

      if (isLiveStreamingClaim) {
        try {
          // Re-fetch the queue row to get last_claim_slot_at_enqueue —
          // not carried on plan_json. Cheap query (PK lookup).
          const { data: queueRow } = await sb
            .from("streaming_claim_queue")
            .select("last_claim_slot_at_enqueue")
            .eq("queue_id", plan.intent_id)
            .maybeSingle();
          const fired = await fireClaimStreaming({
            relayer: relayer.keypair!,
            queueId: plan.intent_id,
            cardPubkey: plan.source_pubkey!,
            pactPubkey: plan.pact_pubkey!,
            ownerPubkey: plan.source_pubkey!, // for streaming the owner is implicit; use card_pubkey as a placeholder for the kernel commit
            destPubkey: plan.dest_pubkey!,
            amountLamports: plan.amount_lamports,
            noteText: null,
            sb,
            lastClaimSlotAtEnqueue: Number(
              queueRow?.last_claim_slot_at_enqueue ?? 0,
            ),
          });
          signature = fired.signature;
          status = fired.confirmed ? "confirmed" : "sent";
          firedHashes = {
            receipt_hash: fired.receiptHashHex,
            reason_hash: fired.reasonHashHex,
            policy_snapshot_hash: fired.policySnapshotHashHex,
            purpose_hash: fired.purposeHashHex,
            context_hash: fired.contextHashHex,
          };
          await sb
            .from("streaming_claim_queue")
            .update({
              status: "fired",
              signature: fired.signature,
              fired_at: new Date().toISOString(),
            })
            .eq("queue_id", plan.intent_id)
            .eq("status", "pending");
        } catch (e) {
          status = "failed";
          errorMessage = `live claim_streaming failed: ${(e as Error).message}`;
          Sentry.captureException(e, {
            level: "error",
            tags: {
              cron: "phase5-signer",
              intent_kind: plan.intent_kind,
              ix_kind: plan.ix_kind,
            },
            extra: {
              intent_id: plan.intent_id,
              source_pubkey: plan.source_pubkey,
              dest_pubkey: plan.dest_pubkey,
              pact_pubkey: plan.pact_pubkey,
            },
          });
        }
      } else if (isLiveSpendable) {
        // Hydrate owner_pubkey + note_text for the kernel commit. The
        // owner is the wallet that authorized this fire originally:
        //   - scheduled_send → schedule.owner_pubkey
        //   - gift_claim     → gift.sender_pubkey  (sender authorized the escrow)
        //   - gift_refund    → gift.sender_pubkey  (same — refund returns to sender)
        // The note is the human-readable context; falls back to a stub
        // when missing so purpose_text_hash is never empty.
        let ownerPubkey: string | null = null;
        let noteText: string | null = null;
        if (plan.intent_kind === "scheduled_send") {
          const { data } = await sb
            .from("scheduled_sends")
            .select("owner_pubkey, note")
            .eq("schedule_id", plan.intent_id)
            .maybeSingle();
          ownerPubkey = data?.owner_pubkey ?? null;
          noteText = data?.note ?? null;
        } else if (
          plan.intent_kind === "gift_claim" ||
          plan.intent_kind === "gift_refund"
        ) {
          const { data } = await sb
            .from("gift_sends")
            .select("sender_pubkey, note")
            .eq("gift_id", plan.intent_id)
            .maybeSingle();
          ownerPubkey = data?.sender_pubkey ?? null;
          noteText =
            data?.note ??
            (plan.intent_kind === "gift_claim" ? "gift claimed" : "gift expired");
        } else if (plan.intent_kind === "group_spend") {
          // For group_spend the kernel commit's "owner" is the
          // requester (the voter who proposed the spend), since they
          // authorized the on-chain Pact spawn.
          const { data } = await sb
            .from("group_spend_requests")
            .select("requester_pubkey, note")
            .eq("request_id", plan.intent_id)
            .maybeSingle();
          ownerPubkey = data?.requester_pubkey ?? null;
          noteText = data?.note ?? "group spend";
        } else if (plan.intent_kind === "round_up") {
          // For round_up the owner is the wallet whose original spend
          // triggered the rule.
          const { data } = await sb
            .from("round_up_queue")
            .select("owner_pubkey, triggering_amount_lamports")
            .eq("queue_id", plan.intent_id)
            .maybeSingle();
          ownerPubkey = data?.owner_pubkey ?? null;
          noteText = data
            ? `round-up of ${(Number(data.triggering_amount_lamports) / 1e6).toFixed(2)}`
            : "round-up";
        } else if (plan.intent_kind === "auto_refill") {
          // For auto_refill, owner is the rule's owner_pubkey (the
          // wallet that set up the rule, i.e. the dest in the actual
          // on-chain ix — they're refilling themselves from savings).
          const { data } = await sb
            .from("auto_refill_queue")
            .select("owner_pubkey, observed_balance_lamports, threshold_lamports")
            .eq("queue_id", plan.intent_id)
            .maybeSingle();
          ownerPubkey = data?.owner_pubkey ?? null;
          noteText = data
            ? `auto-refill: bal $${(Number(data.observed_balance_lamports) / 1e6).toFixed(2)} < threshold $${(Number(data.threshold_lamports) / 1e6).toFixed(2)}`
            : "auto-refill";
        }

        try {
          const fired = await fireSpendViaPact({
            relayer: relayer.keypair!,
            scheduleId: plan.intent_id,
            cardPubkey: plan.source_pubkey!,
            pactPubkey: plan.pact_pubkey!,
            ownerPubkey: ownerPubkey ?? plan.source_pubkey!,
            destPubkey: plan.dest_pubkey!,
            amountLamports: plan.amount_lamports,
            noteText,
          });
          signature = fired.signature;
          status = fired.confirmed ? "confirmed" : "sent";
          firedHashes = {
            receipt_hash: fired.receiptHashHex,
            reason_hash: fired.reasonHashHex,
            policy_snapshot_hash: fired.policySnapshotHashHex,
            purpose_hash: fired.purposeHashHex,
            context_hash: fired.contextHashHex,
          };
          // Group-spend specific: advance the request's status to
          // 'fired' so members see "this is done" in the UI without
          // waiting for the indexer's attribution path. The indexer
          // will still link context_hash → execution_id later.
          if (plan.intent_kind === "group_spend") {
            await sb
              .from("group_spend_requests")
              .update({
                status: "fired",
                signature: fired.signature,
                fired_at: new Date().toISOString(),
              })
              .eq("request_id", plan.intent_id)
              .eq("status", "quorum_met"); // race-safe
          }

          // Round-up specific: mark the queue row fired.
          if (plan.intent_kind === "round_up") {
            await sb
              .from("round_up_queue")
              .update({
                status: "fired",
                signature: fired.signature,
                fired_at: new Date().toISOString(),
              })
              .eq("queue_id", plan.intent_id)
              .eq("status", "pending");
          }

          // Auto-refill specific: mark the queue row fired.
          if (plan.intent_kind === "auto_refill") {
            await sb
              .from("auto_refill_queue")
              .update({
                status: "fired",
                signature: fired.signature,
                fired_at: new Date().toISOString(),
              })
              .eq("queue_id", plan.intent_id)
              .eq("status", "pending");
          }

          // C94 — fire-and-forget push notifications. Wrapped in try
          // so a notify failure never derails the audit row.
          try {
            const amountUsdc = (
              Number(plan.amount_lamports) / 1e6
            ).toFixed(2);
            // For gift_claim, also notify the claimer (dest_pubkey).
            const alsoNotify =
              plan.intent_kind === "gift_claim" ? plan.dest_pubkey : null;
            if (ownerPubkey && plan.dest_pubkey) {
              await notifyPhase5Fire({
                intentKind: plan.intent_kind as
                  | "scheduled_send"
                  | "gift_claim"
                  | "gift_refund"
                  | "group_spend",
                ownerPubkey,
                destPubkey: plan.dest_pubkey,
                amountUsdc,
                signature: fired.signature,
                intentId: plan.intent_id,
                alsoNotify,
              });
            }
          } catch {
            // Push failures are silent by design — the audit row already
            // captures the on-chain state.
          }
        } catch (e) {
          status = "failed";
          errorMessage = `live spend_via_pact failed: ${(e as Error).message}`;
          Sentry.captureException(e, {
            level: "error",
            tags: {
              cron: "phase5-signer",
              intent_kind: plan.intent_kind,
              ix_kind: plan.ix_kind,
            },
            extra: {
              intent_id: plan.intent_id,
              source_pubkey: plan.source_pubkey,
              dest_pubkey: plan.dest_pubkey,
              pact_pubkey: plan.pact_pubkey,
            },
          });
        }
      } else {
        // Live but not yet wired ix kinds → fail loud + tell the operator which.
        status = "failed";
        errorMessage = `live mode wiring for ${plan.intent_kind}/${plan.ix_kind} not implemented yet.`;
        Sentry.captureMessage(errorMessage, {
          level: "error",
          tags: { cron: "phase5-signer", gate: "unimplemented_dispatch", intent_kind: plan.intent_kind, ix_kind: plan.ix_kind },
          extra: { intent_id: plan.intent_id },
        });
      }
    }

    const insertRow: Record<string, unknown> = {
      intent_kind: plan.intent_kind,
      intent_id: plan.intent_id,
      mode,
      status,
      signature,
      plan_json: {
        ...plan,
        card_delegation_validated: cardDelegationOk,
        pact_ready: pactReady,
        relayer_pubkey: relayer.pubkey,
        // Persist the four kernel hashes we committed to on-chain so a
        // verifier can re-derive them from the schedule row + this audit
        // entry without needing to read the raw tx data. Only present
        // for live mode firings; absent for dry_run_logged rows.
        kernel_hashes: firedHashes,
      },
    };
    if (status === "confirmed") {
      insertRow.confirmed_at = new Date().toISOString();
    }
    if (errorMessage) insertRow.error_message = errorMessage;

    // C39 idempotency: bucketed fire window. Two concurrent signer pods
    // racing the same fire produce the same fire_window_ms; the unique
    // index on (intent_kind, intent_id, fire_window_ms) makes the second
    // INSERT fail with 23505 (unique_violation), which we silently swallow.
    insertRow.fire_window_ms = Math.floor(Date.now() / 3_600_000);

    const { error: insErr } = await sb.from("phase5_executions").insert(insertRow);
    if (insErr) {
      if (insErr.code === "23505") {
        // Concurrent pod won the race — work is logged once. Move on.
        continue;
      }
      result.errors.push(`exec_log_insert: ${insErr.message}`);
    } else {
      result.executions_logged += 1;
    }
  }

  return NextResponse.json({
    ok: result.errors.length === 0,
    relayer_pubkey: relayer.pubkey,
    relayer_warning: relayer.error,
    ...result,
  });
}
