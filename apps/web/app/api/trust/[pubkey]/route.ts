import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/trust/[pubkey]?refresh=1
 *
 * F3.12 — Trust score for a Solana wallet.
 *
 * Formula:
 *   score = log10(1 + unique_counterparties) × allow_rate × inverse_dispute_rate
 *
 * Components are cached to agent_trust_scores. Cache freshness:
 *   - Default: serve from cache if last_computed_at is < 5 minutes old.
 *   - ?refresh=1 forces recompute.
 *   - Cache miss: compute + write + return.
 *
 * The wallet is treated symmetrically — both as buyer (cards.authority)
 * and as merchant (receipts.merchant_pubkey). Trust is wallet-level.
 *
 * Tier:
 *   score 0–0.5  → emerging
 *   score 0.5–1.5 → building
 *   score 1.5–3.0 → trusted
 *   score 3.0+   → veteran
 *
 * Auth: public read. The score itself is a public good — anyone can
 * compute it from on-chain receipts; the cache just makes UIs fast.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const STALE_MS = 5 * 60 * 1000;

interface TrustComponents {
  unique_counterparties: number;
  receipts_total: number;
  receipts_allowed: number;
  receipts_denied: number;
  refunds_count: number;
  allow_rate: number;
  inverse_dispute_rate: number;
}

function tierForScore(score: number): "emerging" | "building" | "trusted" | "veteran" {
  if (score >= 3.0) return "veteran";
  if (score >= 1.5) return "trusted";
  if (score >= 0.5) return "building";
  return "emerging";
}

function computeScore(c: TrustComponents): number {
  // log10(1+x) so a wallet with 0 counterparties scores 0 (instead of -Inf
  // or NaN), and the curve flattens after ~100 counterparties (log10(101)
  // ≈ 2.0). Rate factors compress to ≤1 each, so the practical max is
  // around 2.5–3.0 for a real wallet.
  return (
    Math.log10(1 + c.unique_counterparties) *
    Math.max(0, Math.min(1, c.allow_rate)) *
    Math.max(0, Math.min(1, c.inverse_dispute_rate))
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> },
) {
  const { pubkey } = await params;
  if (!PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Try cache.
  if (!refresh) {
    const { data: cached } = await sb
      .from("agent_trust_scores")
      .select(
        "pubkey, score, unique_counterparties, receipts_total, receipts_allowed, receipts_denied, refunds_count, allow_rate, inverse_dispute_rate, last_computed_at, tier",
      )
      .eq("pubkey", pubkey)
      .maybeSingle();
    if (cached) {
      const age = Date.now() - new Date(cached.last_computed_at as string).getTime();
      if (age < STALE_MS) {
        return NextResponse.json({
          ok: true,
          ...cached,
          cached: true,
          stale_for_ms: STALE_MS - age,
        });
      }
    }
  }

  // 2. Recompute. Pull receipts where pubkey is the merchant. (Receipts where
  // pubkey is the BUYER are already keyed by card authority — same wallet =
  // same trust score symmetric properties.)
  // We unify the two via two queries; counted distinct counterparties +
  // decision histogram + refund count.
  type ReceiptStatRow = {
    decision: "ALLOW" | "DENY" | "REVIEW";
    merchant_pubkey: string;
    card_pubkey: string;
  };

  // Receipts where the wallet is the merchant.
  const { data: asMerchant, error: e1 } = await sb
    .from("receipts")
    .select("decision, merchant_pubkey, card_pubkey")
    .eq("merchant_pubkey", pubkey)
    .limit(10000);
  if (e1) {
    return NextResponse.json(
      { error: "supabase_error", message: e1.message },
      { status: 502 },
    );
  }

  // Receipts where the wallet is the buyer (via cards owned by them).
  const { data: ownedCards } = await sb
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", pubkey);
  const cardPubkeys = (ownedCards ?? []).map((c) => c.card_pubkey);
  let asBuyer: ReceiptStatRow[] = [];
  if (cardPubkeys.length > 0) {
    const { data, error } = await sb
      .from("receipts")
      .select("decision, merchant_pubkey, card_pubkey")
      .in("card_pubkey", cardPubkeys)
      .limit(10000);
    if (error) {
      return NextResponse.json(
        { error: "supabase_error", message: error.message },
        { status: 502 },
      );
    }
    asBuyer = (data ?? []) as ReceiptStatRow[];
  }

  const all = [...((asMerchant as ReceiptStatRow[]) ?? []), ...asBuyer];

  // Counterparties — distinct merchant_pubkeys when wallet is buyer, distinct
  // card_pubkeys when wallet is merchant (proxy for "who paid me").
  const counterparties = new Set<string>();
  for (const r of asBuyer) counterparties.add(r.merchant_pubkey);
  for (const r of (asMerchant as ReceiptStatRow[]) ?? []) counterparties.add(r.card_pubkey);
  // Don't count yourself.
  counterparties.delete(pubkey);

  let total = 0;
  let allowed = 0;
  let denied = 0;
  for (const r of all) {
    total += 1;
    if (r.decision === "ALLOW") allowed += 1;
    if (r.decision === "DENY") denied += 1;
  }

  // Refunds — count refund_requests rows for receipts where this wallet is
  // the buyer authority. Refunds initiated against THIS wallet (as merchant)
  // are dispute signals against them.
  let refundsCount = 0;
  {
    const { count } = await sb
      .from("refund_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("authority_pubkey", pubkey);
    refundsCount += count ?? 0;
    // Refunds that target this wallet's merchant role:
    if ((asMerchant ?? []).length > 0) {
      // Need request_ids of receipts where they're the merchant.
      const requestIds = ((asMerchant as ReceiptStatRow[] | null) ?? [])
        .map((r) => (r as unknown as { request_id?: string }).request_id)
        .filter((id): id is string => Boolean(id));
      void requestIds; // We didn't select request_id above; intentionally skip the dispute-against-them count for now to keep the query cost predictable. A future migration can add a denormalized refunds_against count.
    }
  }

  const allow_rate = total > 0 ? allowed / total : 0;
  const inverse_dispute_rate = allowed > 0 ? Math.max(0, 1 - refundsCount / allowed) : 1;

  const components: TrustComponents = {
    unique_counterparties: counterparties.size,
    receipts_total: total,
    receipts_allowed: allowed,
    receipts_denied: denied,
    refunds_count: refundsCount,
    allow_rate,
    inverse_dispute_rate,
  };
  const score = computeScore(components);
  const tier = tierForScore(score);
  const last_computed_at = new Date().toISOString();

  // Write-through cache. If the table doesn't exist (pre-migration-0021),
  // we still return the freshly computed score — the cache is best-effort.
  const { error: upErr } = await sb.from("agent_trust_scores").upsert(
    {
      pubkey,
      score,
      ...components,
      last_computed_at,
      tier,
    },
    { onConflict: "pubkey" },
  );

  return NextResponse.json({
    ok: true,
    pubkey,
    score,
    ...components,
    last_computed_at,
    tier,
    cached: false,
    ...(upErr ? { cache_error: upErr.message } : {}),
  });
}
