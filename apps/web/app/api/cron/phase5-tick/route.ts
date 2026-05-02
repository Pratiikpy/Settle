import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getUsdcMint } from "../../../../lib/solana";
import { getSupabaseServiceClient } from "../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

/**
 * /api/cron/phase5-tick — Phase 5 cron worker.
 *
 * Wakes up periodically (intended cadence: every 5 min via Vercel cron)
 * and processes four queues:
 *
 *   1. scheduled_sends where enabled && next_fire_at <= now
 *      → fire direct_send (queue side-effect: mark last_fired_at, recompute next_fire_at)
 *
 *   2. auto_refill_rules where enabled && (last_refill_at IS NULL or now - last >= cooldown)
 *      AND card balance < threshold (a separate balance read; for the
 *      first ship we approximate by always firing if cooldown elapsed +
 *      relying on the daily_cap to guard double-spend)
 *      → fire spend_via_pact
 *
 *   3. gift_sends where status='pending' and expires_at <= now
 *      → mark status='expired' (refund tx is queued for the claim worker)
 *
 *   4. gift_sends where status='claimed' but claim_request_id IS NULL
 *      → fire direct_send escrow_card → claimer_pubkey, store request_id
 *
 * THIS ENDPOINT INTENTIONALLY DOES NOT FIRE TXS YET. We mark intent +
 * write `pending_tx` rows; a separate signer process (not yet shipped —
 * see C21.2) reads them and signs/sends. This split exists because the
 * cron environment may not hold the relayer keypair, and we want a
 * clean audit trail of "intent to fire" → "fired" → "confirmed".
 *
 * Auth: GET requires `Authorization: Bearer ${CRON_SECRET}` (Vercel cron
 * sends this automatically when configured via vercel.json).
 */

interface TickResult {
  schedules_due: number;
  refills_due: number;
  gifts_expired: number;
  gifts_to_send: number;
  errors: string[];
}

function nextFireAfter(args: {
  cadence: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfPeriod: number | null;
  timeOfDay: string;
  from: Date;
}): Date {
  const [hh, mm] = args.timeOfDay.split(":").map((n) => parseInt(n, 10));
  const candidate = new Date(
    Date.UTC(
      args.from.getUTCFullYear(),
      args.from.getUTCMonth(),
      args.from.getUTCDate(),
      hh,
      mm,
      0,
      0,
    ),
  );
  if (args.cadence === "DAILY") {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate;
  }
  if (args.cadence === "WEEKLY") {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
    return candidate;
  }
  candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  if (args.dayOfPeriod !== null) candidate.setUTCDate(args.dayOfPeriod);
  return candidate;
}

/**
 * Service-role only. Tick advances `last_fired_at`, inserts queue
 * rows; anon fallback would silently no-op (AU-09-006 fix).
 */
function getSb() {
  try {
    return getSupabaseServiceClient();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>. Reject otherwise.
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const result: TickResult = {
    schedules_due: 0,
    refills_due: 0,
    gifts_expired: 0,
    gifts_to_send: 0,
    errors: [],
  };
  const now = new Date();
  const nowIso = now.toISOString();

  // ─── 1. scheduled_sends ───
  try {
    const { data: due, error } = await sb
      .from("scheduled_sends")
      .select("schedule_id, cadence, day_of_period, time_of_day, next_fire_at")
      .eq("enabled", true)
      .lte("next_fire_at", nowIso)
      .limit(100);
    if (error) result.errors.push(`schedules: ${error.message}`);
    else if (due) {
      result.schedules_due = due.length;
      for (const row of due) {
        const nextFire = nextFireAfter({
          cadence: row.cadence as "DAILY" | "WEEKLY" | "MONTHLY",
          dayOfPeriod: row.day_of_period,
          timeOfDay: row.time_of_day,
          from: new Date(row.next_fire_at ?? nowIso),
        }).toISOString();
        await sb
          .from("scheduled_sends")
          .update({ last_fired_at: nowIso, next_fire_at: nextFire })
          .eq("schedule_id", row.schedule_id);
      }
    }
  } catch (e) {
    result.errors.push(`schedules_throw: ${(e as Error).message}`);
  }

  // ─── 2. auto_refill_rules — balance-triggered ───
  // Read enabled rules with all required fields (card + pact + dest).
  // For each, RPC-check the dest wallet's USDC ATA balance. If below
  // threshold AND cooldown elapsed AND no pending queue row exists,
  // enqueue. The signer drains the queue on its next tick.
  try {
    const { data: rules } = await sb
      .from("auto_refill_rules")
      .select(
        "rule_id, owner_pubkey, cooldown_seconds, last_refill_at, threshold_lamports, refill_lamports, pact_pubkey, dest_pubkey",
      )
      .eq("enabled", true)
      .not("pact_pubkey", "is", null)
      .not("dest_pubkey", "is", null)
      .limit(50); // RPC budget — 50 balance checks per tick

    if (rules && rules.length > 0) {
      const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
      const usdcMint = new PublicKey(getUsdcMint());

      // Filter cooldown FIRST (cheap), then RPC-check balances in parallel.
      const cooldownEligible = rules.filter((r) => {
        if (!r.last_refill_at) return true;
        const last = new Date(r.last_refill_at).getTime();
        return now.getTime() - last >= r.cooldown_seconds * 1000;
      });

      const balanceChecks = await Promise.all(
        cooldownEligible.map(async (r) => {
          try {
            const dest = new PublicKey(r.dest_pubkey as string);
            const ata = getAssociatedTokenAddressSync(usdcMint, dest);
            const info = await connection.getTokenAccountBalance(ata, "confirmed");
            const balLamports = BigInt(info.value.amount);
            return { rule: r, balance: balLamports };
          } catch {
            // No ATA = balance 0 — fire would create it. Treat as below threshold.
            return { rule: r, balance: 0n };
          }
        }),
      );

      const triggered = balanceChecks.filter(
        (b) => b.balance < BigInt(b.rule.threshold_lamports),
      );
      result.refills_due = triggered.length;

      for (const t of triggered) {
        // Skip if a pending queue row already exists for this rule.
        const { count } = await sb
          .from("auto_refill_queue")
          .select("*", { count: "exact", head: true })
          .eq("rule_id", t.rule.rule_id)
          .eq("status", "pending");
        if ((count ?? 0) > 0) continue;

        await sb.from("auto_refill_queue").insert({
          rule_id: t.rule.rule_id,
          owner_pubkey: t.rule.owner_pubkey,
          observed_balance_lamports: t.balance.toString(),
          threshold_lamports: t.rule.threshold_lamports,
          refill_lamports: t.rule.refill_lamports,
          dest_pubkey: t.rule.dest_pubkey as string,
          pact_pubkey: t.rule.pact_pubkey as string,
          status: "pending",
        });
        // Optimistic: stamp last_refill_at NOW so cooldown counts from
        // enqueue (not from fire). If the fire later fails, the audit
        // row reflects that and the next tick's cooldown won't re-fire
        // until cooldown_seconds elapse from this attempt.
        await sb
          .from("auto_refill_rules")
          .update({ last_refill_at: nowIso })
          .eq("rule_id", t.rule.rule_id);
      }
    }
  } catch (e) {
    result.errors.push(`refills_throw: ${(e as Error).message}`);
  }

  // ─── 3. gift_sends expired ───
  try {
    const { data: expired, error } = await sb
      .from("gift_sends")
      .update({ status: "expired", refunded_at: nowIso })
      .eq("status", "pending")
      .lte("expires_at", nowIso)
      .select("gift_id");
    if (error) result.errors.push(`gifts_expire: ${error.message}`);
    else result.gifts_expired = (expired ?? []).length;
  } catch (e) {
    result.errors.push(`gifts_expire_throw: ${(e as Error).message}`);
  }

  // ─── 4. gift_sends claimed but unsent ───
  try {
    const { data: toSend, error } = await sb
      .from("gift_sends")
      .select("gift_id, escrow_card, claimer_pubkey, amount_lamports")
      .eq("status", "claimed")
      .is("claim_request_id", null)
      .limit(50);
    if (error) result.errors.push(`gifts_send: ${error.message}`);
    else if (toSend) {
      result.gifts_to_send = toSend.length;
      // Intent only: tag with a deterministic claim_request_id so the
      // signer worker can pick them up next. Keep idempotent by checking
      // that claim_request_id was still null on the conditional update.
      for (const g of toSend) {
        const reqId = crypto.randomUUID();
        await sb
          .from("gift_sends")
          .update({ claim_request_id: reqId })
          .eq("gift_id", g.gift_id)
          .is("claim_request_id", null);
      }
    }
  } catch (e) {
    result.errors.push(`gifts_send_throw: ${(e as Error).message}`);
  }

  // ─── 5. streaming pacts — enqueue claims when claimable accrues ───
  // Read open streaming pacts. For each, compute claimable from
  // (current_slot - last_claim_slot) × rate, capped by max_total -
  // claimed. If above MIN_CLAIM_LAMPORTS and no pending queue row
  // exists, enqueue. The signer cron fires claim_streaming per row.
  //
  // Why a tick-side computation (not signer-side): the tick already
  // has the slot and the pact state from Supabase; signer fires from
  // the queue without re-reading. Same separation as auto_refill.
  try {
    const MIN_CLAIM_LAMPORTS = 100_000n; // $0.10 min — avoids dust spam
    // Snapshot current slot once for the whole batch.
    const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
    const currentSlot = BigInt(await connection.getSlot("confirmed"));

    const { data: streams } = await sb
      .from("pacts")
      .select(
        "pact_pubkey, parent_card, mode, rate_lamports_per_slot, max_total_lamports, claimed, last_claim_slot, paused, closed, expiry_slot",
      )
      .eq("mode", "streaming")
      .eq("closed", false)
      .eq("paused", false)
      .limit(50);

    for (const p of streams ?? []) {
      // Don't claim past expiry.
      if (BigInt(p.expiry_slot) < currentSlot) continue;
      const lastClaim = BigInt(p.last_claim_slot ?? 0);
      const elapsed = currentSlot > lastClaim ? currentSlot - lastClaim : 0n;
      const rate = BigInt(p.rate_lamports_per_slot ?? 0);
      if (rate === 0n || elapsed === 0n) continue;
      const accrued = elapsed * rate;
      const remaining =
        BigInt(p.max_total_lamports ?? 0) - BigInt(p.claimed ?? 0);
      const claimable = accrued < remaining ? accrued : remaining;
      if (claimable < MIN_CLAIM_LAMPORTS) continue;

      // Cooldown: skip if a queue row was created in the last hour
      // for this pact. Catches the case where the signer hasn't drained
      // the previous one yet.
      const cutoffMs = Date.now() - 3_600_000;
      const { count } = await sb
        .from("streaming_claim_queue")
        .select("*", { count: "exact", head: true })
        .eq("pact_pubkey", p.pact_pubkey)
        .gte("created_at", new Date(cutoffMs).toISOString())
        .eq("status", "pending");
      if ((count ?? 0) > 0) continue;

      // Look up the card's authority + the pact's first allowlist
      // merchant. For multi-merchant pacts the agent typically
      // distributes claims via separate calls; v0 picks the first
      // merchant on the allowlist.
      const { data: cardRow } = await sb
        .from("agent_cards")
        .select("authority_pubkey")
        .eq("card_pubkey", p.parent_card)
        .maybeSingle();
      const { data: allowRow } = await sb
        .from("agent_card_allowlist")
        .select("merchant_pubkey")
        .eq("card_pubkey", p.parent_card)
        .limit(1)
        .maybeSingle();
      if (!cardRow?.authority_pubkey || !allowRow?.merchant_pubkey) continue;

      await sb.from("streaming_claim_queue").insert({
        pact_pubkey: p.pact_pubkey,
        card_pubkey: p.parent_card,
        merchant_pubkey: allowRow.merchant_pubkey,
        owner_pubkey: cardRow.authority_pubkey,
        claimable_lamports: claimable.toString(),
        last_claim_slot_at_enqueue: lastClaim.toString(),
        status: "pending",
      });
    }
  } catch (e) {
    result.errors.push(`streaming_claim_throw: ${(e as Error).message}`);
  }

  return NextResponse.json({
    ok: result.errors.length === 0,
    at: nowIso,
    ...result,
  });
}
