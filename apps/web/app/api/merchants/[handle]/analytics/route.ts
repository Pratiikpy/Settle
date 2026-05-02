import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/merchants/[handle]/analytics
 *
 * F4.4 — Merchant analytics. Returns the aggregate stats a merchant
 * cares about for their dashboard:
 *   - daily volume (last 30 days, sparkline-shaped)
 *   - allow rate (allowed / total)
 *   - dispute rate (refunds / allowed)
 *   - top counterparties (by volume)
 *   - top tools / capabilities (by call count)
 *
 * The handle resolves to a merchant pubkey via the existing handles
 * table; we then scope all queries to receipts where merchant_pubkey
 * matches. Public read — analytics ARE the merchant's reputation.
 *
 * Why per-merchant rather than per-card-authority: a merchant is
 * typically NOT an AgentCard authority (those are buyers); they're
 * the recipient. The merchant_pubkey on receipts is what we filter on.
 */

interface DailyPoint {
  day: string; // YYYY-MM-DD
  count: number;
  volume_lamports: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Resolve handle → pubkey.
  const { data: handleRow } = await sb
    .from("handles")
    .select("pubkey")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (!handleRow) {
    return NextResponse.json(
      { error: "handle_not_found", message: `@${handle} not registered` },
      { status: 404 },
    );
  }
  const merchantPubkey = handleRow.pubkey as string;

  const now = Date.now();
  const thirtyAgo = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

  // 2. Pull 30 days of receipts where the merchant is the recipient.
  // Limit 30k — at one receipt per minute that's ~3 weeks; for a high-
  // volume merchant we'd page, but the analytics surface is summary-level
  // and 30k rows is plenty for shape.
  const { data: rows, error } = await sb
    .from("receipts")
    .select(
      "request_id, amount_lamports, decision, capability_hash, card_pubkey, created_at, receipt_kind",
    )
    .eq("merchant_pubkey", merchantPubkey)
    .gte("created_at", thirtyAgo)
    .limit(30000);
  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }

  // 3. Daily aggregation (sparkline).
  const dailyMap = new Map<string, { count: number; volume: bigint }>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { count: 0, volume: 0n });
  }
  let totalAllowed = 0;
  let totalDenied = 0;
  let totalAllVolume = 0n;
  const counterpartyMap = new Map<string, { count: number; volume: bigint }>();
  const capMap = new Map<string, number>();

  for (const r of rows ?? []) {
    const day = String(r.created_at).slice(0, 10);
    const d = dailyMap.get(day);
    if (d && r.decision === "ALLOW") {
      d.count += 1;
      try {
        d.volume += BigInt(String(r.amount_lamports ?? "0"));
      } catch {
        /* skip */
      }
    }
    if (r.decision === "ALLOW") {
      totalAllowed += 1;
      try {
        totalAllVolume += BigInt(String(r.amount_lamports ?? "0"));
      } catch {
        /* skip */
      }
      const cp = r.card_pubkey as string | null;
      if (cp) {
        const e = counterpartyMap.get(cp) ?? { count: 0, volume: 0n };
        e.count += 1;
        try {
          e.volume += BigInt(String(r.amount_lamports ?? "0"));
        } catch {
          /* skip */
        }
        counterpartyMap.set(cp, e);
      }
      let cap = r.capability_hash as string | null;
      if (cap) {
        if (typeof cap === "string" && cap.startsWith("\\x")) cap = cap.slice(2);
        if (cap && /^[0-9a-f]{64}$/i.test(cap)) {
          capMap.set(cap, (capMap.get(cap) ?? 0) + 1);
        }
      }
    } else if (r.decision === "DENY") {
      totalDenied += 1;
    }
  }

  // 4. Refund count — receipts of kind='refund' where this merchant is the
  // sender (i.e. they sent the refund out). For now we surface the simpler
  // metric: refunds against this merchant via refund_requests.
  const requestIds = (rows ?? []).map((r) => r.request_id);
  let refundsCount = 0;
  if (requestIds.length > 0) {
    const { count } = await sb
      .from("refund_requests")
      .select("request_id", { count: "exact", head: true })
      .in("request_id", requestIds);
    refundsCount = count ?? 0;
  }

  // 5. Top capabilities — resolve aliases.
  const topCapHashes = [...capMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const aliasMap = new Map<string, string>();
  if (topCapHashes.length > 0) {
    const { data: aliases } = await sb
      .from("capability_registry")
      .select("capability_hash, alias")
      .in(
        "capability_hash",
        topCapHashes.map(([h]) => h),
      )
      .eq("verified", true);
    for (const a of aliases ?? []) {
      const h = a.capability_hash as string;
      if (!aliasMap.has(h)) aliasMap.set(h, a.alias as string);
    }
  }

  // 6. Top counterparties (by volume).
  const topCounterparties = [...counterpartyMap.entries()]
    .sort((a, b) => Number(b[1].volume - a[1].volume))
    .slice(0, 5)
    .map(([card_pubkey, agg]) => ({
      card_pubkey,
      count: agg.count,
      volume_lamports: agg.volume.toString(),
    }));

  // 7. Build the daily series in chronological order.
  const dailySeries: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    const e = dailyMap.get(key) ?? { count: 0, volume: 0n };
    dailySeries.push({
      day: key,
      count: e.count,
      volume_lamports: e.volume.toString(),
    });
  }

  const total = totalAllowed + totalDenied;
  const allowRate = total === 0 ? 1 : totalAllowed / total;
  const disputeRate =
    totalAllowed === 0 ? 0 : Math.min(1, refundsCount / totalAllowed);

  return NextResponse.json({
    ok: true,
    handle,
    merchant_pubkey: merchantPubkey,
    window_days: 30,
    daily: dailySeries,
    totals: {
      allowed: totalAllowed,
      denied: totalDenied,
      refunds: refundsCount,
      volume_lamports: totalAllVolume.toString(),
    },
    rates: {
      allow: allowRate,
      dispute: disputeRate,
    },
    top_counterparties: topCounterparties,
    top_capabilities: topCapHashes.map(([hash, count]) => ({
      capability_hash: hash,
      alias: aliasMap.get(hash) ?? null,
      count,
    })),
  });
}
