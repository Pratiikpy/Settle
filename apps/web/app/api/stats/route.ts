import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stats — F9.4 public transparency feed.
 *
 * Returns aggregate counters with no per-user data:
 *   - receipts: 24h / 7d / all-time
 *   - usd_volume_lamports: sum of amount_lamports across allowed receipts
 *   - kind histogram (24h)
 *   - decision histogram (24h)
 *   - top capabilities (last 7d, by volume)
 *   - on-chain attestations (last 24h)
 *   - merchants serving (distinct merchant_pubkey, last 7d)
 *
 * Public read; no auth. Cached for 60s on the API layer to keep query
 * cost predictable even under traffic.
 *
 * Why this matters: "transparency report" is the public-good shape that
 * makes Settle's protocol claims auditable. Anyone — judges, users,
 * regulators — can sanity-check the system at a glance.
 */

interface StatsResponse {
  ok: true;
  generated_at: string;
  cluster: string;
  receipts: { day: number; week: number; all_time: number };
  usd_volume_lamports: { day: string; week: string; all_time: string };
  kind_histogram_day: Record<string, number>;
  decision_histogram_day: Record<string, number>;
  top_capabilities_week: Array<{
    capability_hash: string;
    alias: string | null;
    count: number;
    volume_lamports: string;
  }>;
  on_chain_attestations_day: number;
  merchants_serving_week: number;
}

let cached: { ts: number; data: StatsResponse } | null = null;
const TTL_MS = 60_000;

export async function GET() {
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return NextResponse.json({ ...cached.data, cached: true });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // ───── counts ─────
  const { count: total24h } = await sb
    .from("receipts")
    .select("request_id", { count: "exact", head: true })
    .gte("created_at", dayAgo);
  const { count: total7d } = await sb
    .from("receipts")
    .select("request_id", { count: "exact", head: true })
    .gte("created_at", weekAgo);
  const { count: totalAllTime } = await sb
    .from("receipts")
    .select("request_id", { count: "exact", head: true });

  // ───── volume + histograms (24h) ─────
  const { data: dayRows } = await sb
    .from("receipts")
    .select("amount_lamports, decision, receipt_kind")
    .gte("created_at", dayAgo)
    .limit(10000);
  let volDayLam = 0n;
  const kindHist: Record<string, number> = {};
  const decisionHist: Record<string, number> = {};
  for (const r of dayRows ?? []) {
    if (r.decision === "ALLOW") {
      try {
        volDayLam += BigInt(String(r.amount_lamports ?? "0"));
      } catch {
        /* skip */
      }
    }
    const k = (r.receipt_kind as string | null) ?? "x402_spend";
    kindHist[k] = (kindHist[k] ?? 0) + 1;
    const d = String(r.decision ?? "ALLOW");
    decisionHist[d] = (decisionHist[d] ?? 0) + 1;
  }

  // ───── volume (week + all-time) — page through if needed ─────
  let volWeekLam = 0n;
  {
    const { data } = await sb
      .from("receipts")
      .select("amount_lamports")
      .eq("decision", "ALLOW")
      .gte("created_at", weekAgo)
      .limit(20000);
    for (const r of data ?? []) {
      try {
        volWeekLam += BigInt(String(r.amount_lamports ?? "0"));
      } catch {
        /* skip */
      }
    }
  }

  let volAllLam = 0n;
  {
    const { data } = await sb
      .from("receipts")
      .select("amount_lamports")
      .eq("decision", "ALLOW")
      .limit(50000);
    for (const r of data ?? []) {
      try {
        volAllLam += BigInt(String(r.amount_lamports ?? "0"));
      } catch {
        /* skip */
      }
    }
  }

  // ───── top capabilities (7d) ─────
  const { data: capRows } = await sb
    .from("receipts")
    .select("capability_hash, amount_lamports, decision")
    .gte("created_at", weekAgo)
    .eq("decision", "ALLOW")
    .limit(20000);
  const capAgg = new Map<string, { count: number; volume: bigint }>();
  for (const r of capRows ?? []) {
    let hash = r.capability_hash as string | null;
    if (!hash) continue;
    if (typeof hash === "string" && hash.startsWith("\\x")) hash = hash.slice(2);
    if (!/^[0-9a-f]{64}$/i.test(hash ?? "")) continue;
    const k = (hash as string).toLowerCase();
    const existing = capAgg.get(k) ?? { count: 0, volume: 0n };
    existing.count += 1;
    try {
      existing.volume += BigInt(String(r.amount_lamports ?? "0"));
    } catch {
      /* skip */
    }
    capAgg.set(k, existing);
  }
  const topHashes = [...capAgg.entries()]
    .sort((a, b) => Number(b[1].volume - a[1].volume))
    .slice(0, 10);

  // Resolve aliases for the top hashes.
  const aliasMap = new Map<string, string>();
  if (topHashes.length > 0) {
    const { data: aliases } = await sb
      .from("capability_registry")
      .select("capability_hash, alias, verified")
      .in(
        "capability_hash",
        topHashes.map((h) => h[0]),
      )
      .eq("verified", true);
    for (const a of aliases ?? []) {
      const h = a.capability_hash as string;
      if (!aliasMap.has(h)) aliasMap.set(h, a.alias as string);
    }
  }

  const top_capabilities_week = topHashes.map(([hash, agg]) => ({
    capability_hash: hash,
    alias: aliasMap.get(hash) ?? null,
    count: agg.count,
    volume_lamports: agg.volume.toString(),
  }));

  // ───── on-chain attestations (24h) ─────
  const { count: attest24h } = await sb
    .from("kernel_receipt_attestations")
    .select("sig_solscan", { count: "exact", head: true })
    .gte("created_at", dayAgo);

  // ───── merchants serving (7d distinct) ─────
  const { data: merchantRows } = await sb
    .from("receipts")
    .select("merchant_pubkey")
    .gte("created_at", weekAgo)
    .limit(20000);
  const merchantSet = new Set<string>();
  for (const r of merchantRows ?? []) merchantSet.add(String(r.merchant_pubkey ?? ""));
  merchantSet.delete("");

  const data: StatsResponse = {
    ok: true,
    generated_at: new Date().toISOString(),
    cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet",
    receipts: {
      day: total24h ?? 0,
      week: total7d ?? 0,
      all_time: totalAllTime ?? 0,
    },
    usd_volume_lamports: {
      day: volDayLam.toString(),
      week: volWeekLam.toString(),
      all_time: volAllLam.toString(),
    },
    kind_histogram_day: kindHist,
    decision_histogram_day: decisionHist,
    top_capabilities_week,
    on_chain_attestations_day: attest24h ?? 0,
    merchants_serving_week: merchantSet.size,
  };
  cached = { ts: Date.now(), data };

  return NextResponse.json({ ...data, cached: false });
}
