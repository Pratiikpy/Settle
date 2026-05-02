import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fraud/scan
 *   body: { pubkey: string }
 *
 * F29.4 — AI fraud detection.
 *
 * Pulls the wallet's last 30 days of receipts (as buyer) and runs a
 * suite of deterministic anomaly rules. Every flagged finding is
 * appended to fraud_flags and returned in the response.
 *
 * Rules (all 0..1 score):
 *   - sudden_volume_spike: today's volume > 5× the wallet's 7-day avg
 *   - novel_merchant: merchant pubkey never seen before in the wallet's
 *     30-day history, and amount > $1
 *   - off_hours_burst: receipts clustered between 02:00–05:00 local UTC
 *     where the wallet's typical activity is 09:00–22:00
 *   - deny_cluster: ≥3 DENYs in a 1-hour window
 *
 * The scoring is intentionally rule-based + transparent. An LLM-driven
 * version is a future iteration; for now "explainable" beats "smart"
 * because false positives in a fraud signal damage trust.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface Receipt {
  request_id: string;
  merchant_pubkey: string;
  amount_lamports: string;
  decision: "ALLOW" | "DENY" | "REVIEW";
  created_at: string;
}

interface Flag {
  rule: string;
  score: number;
  context: Record<string, unknown>;
  request_id?: string;
}

export async function POST(req: NextRequest) {
  let body: { pubkey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.pubkey || !PUBKEY_RE.test(body.pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Cards owned by this wallet.
  const { data: cards } = await sb
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", body.pubkey);
  const cardPubkeys = (cards ?? []).map((c) => c.card_pubkey as string);
  if (cardPubkeys.length === 0) {
    return NextResponse.json({
      ok: true,
      pubkey: body.pubkey,
      flags: [],
      message: "No cards owned — nothing to scan.",
    });
  }

  // 30d receipts.
  const now = Date.now();
  const thirtyAgo = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
  const { data: rows, error } = await sb
    .from("receipts")
    .select("request_id, merchant_pubkey, amount_lamports, decision, created_at")
    .in("card_pubkey", cardPubkeys)
    .gte("created_at", thirtyAgo)
    .order("created_at", { ascending: true })
    .limit(20000);
  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }
  const receipts = (rows ?? []) as unknown as Receipt[];

  const flags: Flag[] = [];

  // ─────── rule 1: sudden_volume_spike ───────
  const volByDay = new Map<string, bigint>();
  for (const r of receipts) {
    if (r.decision !== "ALLOW") continue;
    const day = String(r.created_at).slice(0, 10);
    const prev = volByDay.get(day) ?? 0n;
    try {
      volByDay.set(day, prev + BigInt(r.amount_lamports));
    } catch {
      /* skip */
    }
  }
  // Last 7 days excluding today, then today vs that average.
  const todayKey = new Date(now).toISOString().slice(0, 10);
  let last7Sum = 0n;
  let last7Count = 0;
  for (let i = 1; i <= 7; i++) {
    const k = new Date(now - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const v = volByDay.get(k);
    if (v !== undefined) {
      last7Sum += v;
      last7Count += 1;
    }
  }
  const avg7d = last7Count === 0 ? 0n : last7Sum / BigInt(last7Count);
  const today = volByDay.get(todayKey) ?? 0n;
  if (avg7d > 0n && today > avg7d * 5n) {
    flags.push({
      rule: "sudden_volume_spike",
      score: 0.85,
      context: {
        today_lamports: today.toString(),
        avg_7d_lamports: avg7d.toString(),
        ratio: Number(today) / Math.max(1, Number(avg7d)),
      },
    });
  }

  // ─────── rule 2: novel_merchant ───────
  // First time seen + amount > $1 = a flag worth surfacing.
  const seenMerchants = new Map<string, Date>(); // first time we saw each merchant
  for (const r of receipts) {
    if (r.decision !== "ALLOW") continue;
    const created = new Date(r.created_at);
    if (!seenMerchants.has(r.merchant_pubkey)) {
      seenMerchants.set(r.merchant_pubkey, created);
    }
  }
  // Recheck: any merchant whose first-seen is in the last 24h AND amount > 1 USDC.
  const dayAgo = now - 24 * 3600 * 1000;
  for (const r of receipts) {
    if (r.decision !== "ALLOW") continue;
    const first = seenMerchants.get(r.merchant_pubkey);
    if (!first) continue;
    if (first.getTime() < dayAgo) continue;
    if (first.toISOString() !== r.created_at) continue;
    let amount = 0n;
    try {
      amount = BigInt(r.amount_lamports);
    } catch {
      continue;
    }
    if (amount > 1_000_000n) {
      flags.push({
        rule: "novel_merchant",
        score: 0.55,
        request_id: r.request_id,
        context: {
          merchant_pubkey: r.merchant_pubkey,
          amount_lamports: r.amount_lamports,
          first_seen_at: r.created_at,
        },
      });
    }
  }

  // ─────── rule 3: deny_cluster ───────
  // ≥3 DENYs within any 1-hour rolling window in the last 24h.
  const denyTimes = receipts
    .filter((r) => r.decision === "DENY")
    .map((r) => new Date(r.created_at).getTime())
    .filter((t) => t > dayAgo)
    .sort((a, b) => a - b);
  for (let i = 0; i + 2 < denyTimes.length; i++) {
    if (denyTimes[i + 2]! - denyTimes[i]! <= 3600 * 1000) {
      flags.push({
        rule: "deny_cluster",
        score: 0.7,
        context: {
          deny_count: denyTimes.length,
          window_started_at: new Date(denyTimes[i]!).toISOString(),
          window_end_at: new Date(denyTimes[i + 2]!).toISOString(),
        },
      });
      break; // one flag per scan; the cluster is a single signal
    }
  }

  // ─────── rule 4: off_hours_burst ───────
  // ≥3 receipts between 02:00–05:00 UTC in the last 24h, when the
  // wallet's 30d 02–05 share is < 5%.
  let offHoursTotal = 0;
  let totalAllow = 0;
  for (const r of receipts) {
    if (r.decision !== "ALLOW") continue;
    totalAllow += 1;
    const hour = new Date(r.created_at).getUTCHours();
    if (hour >= 2 && hour < 5) offHoursTotal += 1;
  }
  const offHoursShare = totalAllow === 0 ? 0 : offHoursTotal / totalAllow;
  if (offHoursShare < 0.05) {
    let recentOffHours = 0;
    for (const r of receipts) {
      if (r.decision !== "ALLOW") continue;
      const t = new Date(r.created_at).getTime();
      if (t < dayAgo) continue;
      const h = new Date(r.created_at).getUTCHours();
      if (h >= 2 && h < 5) recentOffHours += 1;
    }
    if (recentOffHours >= 3) {
      flags.push({
        rule: "off_hours_burst",
        score: 0.6,
        context: {
          off_hours_24h_count: recentOffHours,
          off_hours_30d_share: offHoursShare,
        },
      });
    }
  }

  // Persist all flags.
  if (flags.length > 0) {
    const rows = flags.map((f) => ({
      subject_pubkey: body.pubkey,
      request_id: f.request_id ?? null,
      rule: f.rule,
      score: f.score,
      context_json: f.context,
    }));
    await sb.from("fraud_flags").insert(rows);
  }

  return NextResponse.json({
    ok: true,
    pubkey: body.pubkey,
    receipts_scanned: receipts.length,
    flags,
    cards_owned: cardPubkeys.length,
  });
}
