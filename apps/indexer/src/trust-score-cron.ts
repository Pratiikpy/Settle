/**
 * F3.12 — periodic trust-score recomputation.
 *
 * Formula:
 *   score = log10(1 + unique_counterparties) × allow_rate × inverse_dispute_rate × 50
 *
 * Caps at 100. Tier:
 *   < 20  → "emerging"
 *   < 60  → "trusted"
 *   < 90  → "veteran"
 *   90+   → "legendary"
 *
 * Run interval: 5 min. Cheap aggregate query against `receipts` per
 * pubkey, write back to `agent_trust_scores`. Idempotent — re-running
 * just refreshes the row.
 *
 * Wave 1 / Stream C2 — early build because trust-score badge on
 * agent profile (Stream C5 home dashboard) reads this table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const RECOMPUTE_INTERVAL_MS = 5 * 60_000; // 5 min
const TOP_N_RECOMPUTE = 200; // recompute the 200 most-active pubkeys per tick

function tier(score: number): "emerging" | "trusted" | "veteran" | "legendary" {
  if (score >= 90) return "legendary";
  if (score >= 60) return "veteran";
  if (score >= 20) return "trusted";
  return "emerging";
}

async function recomputeOne(supabase: SupabaseClient, pubkey: string): Promise<void> {
  // Aggregate receipts where this pubkey is the merchant OR card.authority
  // AND decision ∈ {ALLOW, DENY}. We treat REVOKE as positive (revoking
  // is owner-sovereign, not a trust hit).
  const { data: receipts } = await supabase
    .from("receipts")
    .select("merchant_pubkey, card_pubkey, decision, created_at")
    .or(`merchant_pubkey.eq.${pubkey}`)
    .gte("created_at", new Date(Date.now() - 90 * 86400_000).toISOString())
    .limit(2000);
  const rows = receipts ?? [];

  // Counterparties = unique merchant+card_pubkeys other than self
  const counterparties = new Set<string>();
  let allowed = 0;
  let denied = 0;
  for (const r of rows) {
    const other = r.merchant_pubkey === pubkey ? r.card_pubkey : r.merchant_pubkey;
    if (other && other !== pubkey) counterparties.add(other as string);
    if (r.decision === "ALLOW") allowed += 1;
    else if (r.decision === "DENY") denied += 1;
  }
  const total = allowed + denied;

  // Refund count: receipts in refund_requests for this user
  const { count: refundCount } = await supabase
    .from("refund_requests")
    .select("*", { count: "exact", head: true })
    .eq("authority_pubkey", pubkey);

  const allowRate = total === 0 ? 0 : allowed / total;
  const inverseDispute = total === 0 ? 1 : 1 - Math.min(1, (refundCount ?? 0) / total);
  const uniqCp = counterparties.size;

  // log10(1+N) × allowRate × inverseDispute × 50, capped at 100
  const score = Math.min(
    100,
    Math.log10(1 + uniqCp) * allowRate * inverseDispute * 50,
  );

  await supabase.from("agent_trust_scores").upsert(
    {
      pubkey,
      score,
      unique_counterparties: uniqCp,
      receipts_total: total,
      receipts_allowed: allowed,
      receipts_denied: denied,
      refunds_count: refundCount ?? 0,
      allow_rate: allowRate,
      inverse_dispute_rate: inverseDispute,
      last_computed_at: new Date().toISOString(),
      tier: tier(score),
    },
    { onConflict: "pubkey" },
  );
}

async function tick(supabase: SupabaseClient): Promise<void> {
  // Find the N most-active pubkeys in the last 7d (hot set).
  const { data: hot } = await supabase
    .from("receipts")
    .select("merchant_pubkey")
    .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
    .not("merchant_pubkey", "is", null)
    .limit(2000);

  const seen = new Set<string>();
  for (const r of hot ?? []) {
    if (r.merchant_pubkey) seen.add(r.merchant_pubkey as string);
    if (seen.size >= TOP_N_RECOMPUTE) break;
  }

  // Plus all pubkeys whose existing trust score is older than 24h
  const { data: stale } = await supabase
    .from("agent_trust_scores")
    .select("pubkey")
    .lt("last_computed_at", new Date(Date.now() - 86400_000).toISOString())
    .limit(50);
  for (const r of stale ?? []) seen.add(r.pubkey as string);

  console.log(`[trust-score-cron] recomputing ${seen.size} pubkeys`);
  let ok = 0;
  let err = 0;
  for (const pk of seen) {
    try {
      await recomputeOne(supabase, pk);
      ok += 1;
    } catch (e) {
      err += 1;
      console.error(
        `[trust-score-cron] err pubkey=${pk.slice(0, 8)}… ${(e as Error).message}`,
      );
    }
  }
  console.log(`[trust-score-cron] tick done — ok=${ok} err=${err}`);
}

export function startTrustScoreCron(supabase: SupabaseClient): NodeJS.Timeout {
  // First tick at start, then on interval.
  void tick(supabase);
  return setInterval(() => void tick(supabase), RECOMPUTE_INTERVAL_MS);
}
