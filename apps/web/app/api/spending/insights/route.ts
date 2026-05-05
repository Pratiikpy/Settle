import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/spending/insights?authority=<pubkey>&since_days=30
 *
 * Returns spending aggregated by merchant + category over the last N days.
 * Categories come from `verified_merchants.category` (V2 column) or are heuristically
 * derived from display_name (V1).
 *
 * Response:
 *   {
 *     total_usdc: "12.34",
 *     by_category: { research: "8.40", translation: "2.50", summary: "1.44" },
 *     by_merchant: [{ name, amount_usdc, count }],
 *     daily_series: [{ date, amount_usdc }],
 *     top_merchant: { name, amount_usdc },
 *   }
 */

const CATEGORY_HEURISTICS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /arxiv|research|paper|fetch/i, category: "research" },
  { pattern: /translate|translation|lang/i, category: "translation" },
  { pattern: /summar|tldr|digest/i, category: "summarization" },
  { pattern: /design|figma|sketch/i, category: "design" },
  { pattern: /writer|author|copy/i, category: "writing" },
  { pattern: /code|dev|github/i, category: "development" },
];

function categorize(displayName?: string | null): string {
  if (!displayName) return "uncategorized";
  for (const { pattern, category } of CATEGORY_HEURISTICS) {
    if (pattern.test(displayName)) return category;
  }
  return "other";
}

export async function GET(req: NextRequest) {
  const authority = req.nextUrl.searchParams.get("authority");
  if (!authority || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(authority)) {
    return NextResponse.json({ error: "invalid_or_missing_authority" }, { status: 400 });
  }
  const sinceDays = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get("since_days") ?? "30")));

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();

  // Cards owned by this authority
  const { data: cards } = await supabase
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", authority);
  const cardPubkeys = (cards ?? []).map((c) => c.card_pubkey);

  // Bug #38 + production blocker fix: use the proven `.or()` shape
  // from /api/dashboard (which works on prod) instead of `.in()`.
  // Reason: in production /api/dashboard returns rows reliably via
  // .or(card_pubkey.eq.A,card_pubkey.eq.B,...) but `.in()` was
  // returning 0 from this route under unclear runtime conditions.
  const cardKeysWithSelf = [authority, ...cardPubkeys];
  const orFilter = cardKeysWithSelf
    .map((k) => `card_pubkey.eq.${k}`)
    .join(",");
  const { data: receipts, error: rErr } = await supabase
    .from("receipts")
    .select("merchant_pubkey, amount_lamports, created_at, decision")
    .or(orFilter)
    .eq("decision", "ALLOW")
    .gte("created_at", since);

  if (rErr) {
    return NextResponse.json({ error: "supabase_error", message: rErr.message }, { status: 502 });
  }

  // Lookup merchant display names for category derivation
  const merchantPubkeys = [...new Set((receipts ?? []).map((r) => r.merchant_pubkey))];
  const merchantMap = new Map<string, string>();
  if (merchantPubkeys.length > 0) {
    const { data: merchants } = await supabase
      .from("verified_merchants")
      .select("merchant_pubkey, display_name")
      .in("merchant_pubkey", merchantPubkeys);
    for (const m of merchants ?? []) {
      merchantMap.set(m.merchant_pubkey, m.display_name ?? "");
    }
  }

  // Aggregate
  let totalLamports = 0n;
  const byCategory: Record<string, bigint> = {};
  const byMerchant: Record<string, { name: string; lamports: bigint; count: number }> = {};
  const byDay: Record<string, bigint> = {};

  for (const r of receipts ?? []) {
    const lamports = BigInt(r.amount_lamports);
    totalLamports += lamports;

    const merchantName = merchantMap.get(r.merchant_pubkey) ?? r.merchant_pubkey.slice(0, 6);
    const category = categorize(merchantName);
    byCategory[category] = (byCategory[category] ?? 0n) + lamports;

    const m = byMerchant[r.merchant_pubkey] ?? { name: merchantName, lamports: 0n, count: 0 };
    m.lamports += lamports;
    m.count += 1;
    byMerchant[r.merchant_pubkey] = m;

    const day = r.created_at.slice(0, 10); // YYYY-MM-DD
    byDay[day] = (byDay[day] ?? 0n) + lamports;
  }

  function lamportsToUsdc(l: bigint): string {
    const whole = l / 1_000_000n;
    const frac = l % 1_000_000n;
    return `${whole}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
  }

  const merchantList = Object.entries(byMerchant)
    .map(([pubkey, m]) => ({
      pubkey,
      name: m.name,
      amount_usdc: lamportsToUsdc(m.lamports),
      count: m.count,
    }))
    .sort((a, b) => Number(b.amount_usdc) - Number(a.amount_usdc));

  return NextResponse.json({
    ok: true,
    since_iso: since,
    since_days: sinceDays,
    total_usdc: lamportsToUsdc(totalLamports),
    by_category: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, lamportsToUsdc(v)]),
    ),
    by_merchant: merchantList,
    daily_series: Object.entries(byDay)
      .map(([date, lamports]) => ({ date, amount_usdc: lamportsToUsdc(lamports) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    top_merchant: merchantList[0] ?? null,
  });
}
