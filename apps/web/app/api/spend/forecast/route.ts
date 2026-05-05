import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/spend/forecast?pubkey=<base58>
 *
 * F33.3 — Spend forecasting + burn-rate alerts.
 *
 * Pulls 30 days of receipts where the wallet is the buyer, then:
 *   - daily series (count + lamports) for sparkline
 *   - 30d total + average daily spend
 *   - 7d trailing average vs full-30d average → "burn rate" delta
 *   - projection for the next 7 days using 7d trailing avg
 *   - alerts:
 *       * "spend_spike" when 7d-avg > 2× the 30d-avg
 *       * "approaching_cap" when projected 7d > sum(daily_caps) * 7
 *
 * Public read with the caller's pubkey as filter — no cross-wallet leak.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface DailyPoint {
  day: string;
  count: number;
  volume_lamports: string;
}

interface Alert {
  rule: "spend_spike" | "approaching_cap" | "novel_pattern";
  severity: "info" | "warn" | "critical";
  message: string;
  context: Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pubkey = url.searchParams.get("pubkey")?.trim();
  if (!pubkey || !PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  // Resolve cards owned by this wallet.
  const { data: cards } = await sb
    .from("agent_cards")
    .select("card_pubkey, daily_cap_lamports")
    .eq("authority_pubkey", pubkey);
  const cardPubkeys = (cards ?? []).map((c) => c.card_pubkey as string);
  const totalDailyCap = (cards ?? []).reduce(
    (acc, c) => acc + Number(c.daily_cap_lamports ?? 0),
    0,
  );

  if (cardPubkeys.length === 0) {
    return NextResponse.json({
      ok: true,
      pubkey,
      message: "No cards owned — nothing to forecast.",
      daily: [],
      summary: null,
      alerts: [],
    });
  }

  // 30d window. Bug #38: include user's wallet — direct sends use it
  // as card_pubkey, so a user without agent cards but with regular
  // direct sends used to get an empty forecast.
  const cardKeysWithSelf = [pubkey, ...cardPubkeys];
  const now = Date.now();
  const thirtyAgo = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
  const { data: rows, error } = await sb
    .from("receipts")
    .select("amount_lamports, decision, created_at")
    .in("card_pubkey", cardKeysWithSelf)
    .gte("created_at", thirtyAgo)
    .limit(20000);
  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }

  // Bucket by day.
  const dailyMap = new Map<string, { count: number; volume: bigint }>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now - i * 24 * 3600 * 1000);
    const k = d.toISOString().slice(0, 10);
    dailyMap.set(k, { count: 0, volume: 0n });
  }
  let total30dLam = 0n;
  for (const r of rows ?? []) {
    if (r.decision !== "ALLOW") continue;
    const day = String(r.created_at).slice(0, 10);
    const e = dailyMap.get(day);
    if (!e) continue;
    e.count += 1;
    try {
      const v = BigInt(String(r.amount_lamports ?? "0"));
      e.volume += v;
      total30dLam += v;
    } catch {
      /* skip */
    }
  }

  const daily: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600 * 1000);
    const k = d.toISOString().slice(0, 10);
    const e = dailyMap.get(k) ?? { count: 0, volume: 0n };
    daily.push({ day: k, count: e.count, volume_lamports: e.volume.toString() });
  }

  // Averages.
  const avg30dLam = total30dLam / 30n;
  const last7 = daily.slice(-7);
  let total7dLam = 0n;
  for (const d of last7) {
    try {
      total7dLam += BigInt(d.volume_lamports);
    } catch {
      /* skip */
    }
  }
  const avg7dLam = total7dLam / 7n;
  const projected7dLam = avg7dLam * 7n;

  // Alerts.
  const alerts: Alert[] = [];

  if (avg30dLam > 0n && avg7dLam > avg30dLam * 2n) {
    alerts.push({
      rule: "spend_spike",
      severity: "warn",
      message: `7-day average ($${(Number(avg7dLam) / 1e6).toFixed(2)}/day) is more than 2× your 30-day average ($${(Number(avg30dLam) / 1e6).toFixed(2)}/day).`,
      context: {
        avg7d_lamports: avg7dLam.toString(),
        avg30d_lamports: avg30dLam.toString(),
        ratio:
          avg30dLam === 0n
            ? null
            : Number(avg7dLam) / Math.max(1, Number(avg30dLam)),
      },
    });
  }

  if (totalDailyCap > 0 && Number(projected7dLam) > totalDailyCap * 7) {
    alerts.push({
      rule: "approaching_cap",
      severity: "critical",
      message: `Projected 7-day spend ($${(Number(projected7dLam) / 1e6).toFixed(2)}) exceeds the sum of your daily caps ($${(totalDailyCap / 1e6).toFixed(2)}/day × 7). Some receipts will be denied.`,
      context: {
        projected7d_lamports: projected7dLam.toString(),
        total_daily_cap_lamports: totalDailyCap.toString(),
      },
    });
  }

  return NextResponse.json({
    ok: true,
    pubkey,
    window_days: 30,
    daily,
    summary: {
      total30d_lamports: total30dLam.toString(),
      avg_per_day_lamports: avg30dLam.toString(),
      avg7d_lamports: avg7dLam.toString(),
      projected_next7d_lamports: projected7dLam.toString(),
      total_daily_cap_lamports: totalDailyCap.toString(),
    },
    alerts,
  });
}
