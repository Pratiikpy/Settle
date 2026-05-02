"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CapabilityBadge, TrustScoreBadge } from "@settle/ui";
import { W6AppShell } from "../../../../components/w6-app-shell";

/**
 * F4.4 — Merchant analytics dashboard.
 *
 * Public-read view of a merchant's volume + reliability metrics. Lives
 * at /m/[handle]/analytics so it's the canonical "tell me about this
 * merchant" surface — buyers, payers, and the merchant themselves all
 * see the same aggregate.
 */

interface DailyPoint {
  day: string;
  count: number;
  volume_lamports: string;
}

interface AnalyticsResponse {
  ok: boolean;
  handle: string;
  merchant_pubkey: string;
  window_days: number;
  daily: DailyPoint[];
  totals: {
    allowed: number;
    denied: number;
    refunds: number;
    volume_lamports: string;
  };
  rates: {
    allow: number;
    dispute: number;
  };
  top_counterparties: Array<{
    card_pubkey: string;
    count: number;
    volume_lamports: string;
  }>;
  top_capabilities: Array<{
    capability_hash: string;
    alias: string | null;
    count: number;
  }>;
  error?: string;
  message?: string;
}

function fmtUsdc(lamports: string): string {
  const n = Number(lamports);
  return (n / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function MerchantAnalyticsPage() {
  const params = useParams<{ handle: string }>();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.handle) return;
    setLoading(true);
    void fetch(`/api/merchants/${params.handle}/analytics`)
      .then((r) => r.json())
      .then((j) => setData(j as AnalyticsResponse))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [params.handle]);

  return (
    <W6AppShell forceSurface="merchant">
      <div style={{ maxWidth: 980 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Merchant · analytics
        </div>
        <h1
          className="w6-heading"
          style={{
            fontSize: 36,
            margin: "8px 0 0",
            lineHeight: 1.05,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>@{params.handle}</span>
          {data?.ok && (
            <TrustScoreBadge pubkey={data.merchant_pubkey} variant="full" />
          )}
        </h1>

        {loading && (
          <p className="mt-6 text-sm text-foreground/50">Loading…</p>
        )}

        {data && !data.ok && (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5 text-sm text-red-300">
            {data.message ?? data.error ?? "Failed to load."}
          </div>
        )}

        {data?.ok && (
          <>
            {/* Totals */}
            <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Counter
                label={`Volume · ${data.window_days}d`}
                value={`$${fmtUsdc(data.totals.volume_lamports)}`}
              />
              <Counter
                label="Allowed"
                value={data.totals.allowed.toLocaleString()}
              />
              <Counter
                label="Allow rate"
                value={`${(data.rates.allow * 100).toFixed(1)}%`}
              />
              <Counter
                label="Dispute rate"
                value={`${(data.rates.dispute * 100).toFixed(1)}%`}
              />
            </section>

            {/* Sparkline */}
            <section className="mt-8 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-medium">
                Daily volume · last {data.window_days} days
              </h2>
              <Sparkline daily={data.daily} />
            </section>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {/* Top counterparties */}
              <section className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
                <h2 className="text-sm font-medium">Top counterparties</h2>
                {data.top_counterparties.length === 0 ? (
                  <p className="mt-3 text-xs text-foreground/40">
                    No counterparties yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-xs">
                    {data.top_counterparties.map((c) => (
                      <li
                        key={c.card_pubkey}
                        className="flex items-baseline justify-between gap-3 border-b border-foreground/5 pb-2 last:border-0"
                      >
                        <span className="font-mono truncate text-foreground/75">
                          {c.card_pubkey.slice(0, 6)}…{c.card_pubkey.slice(-4)}
                        </span>
                        <span className="text-foreground/55">
                          {c.count} · ${fmtUsdc(c.volume_lamports)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Top capabilities */}
              <section className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
                <h2 className="text-sm font-medium">Top capabilities</h2>
                {data.top_capabilities.length === 0 ? (
                  <p className="mt-3 text-xs text-foreground/40">
                    No capability hashes recorded yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3 text-xs">
                    {data.top_capabilities.map((c) => (
                      <li
                        key={c.capability_hash}
                        className="flex items-center justify-between gap-3 border-b border-foreground/5 pb-2 last:border-0"
                      >
                        <CapabilityBadge hash={c.capability_hash} />
                        <span className="text-foreground/55">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="mt-10 flex gap-3">
              <Link
                href={`/at/${params.handle}`}
                className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
              >
                ← Profile
              </Link>
              <Link
                href={`/api/merchants/${params.handle}/analytics`}
                className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
              >
                Raw JSON ↗
              </Link>
            </div>
          </>
        )}
      </div>
    </W6AppShell>
  );
}

function Counter(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-white/[0.04] p-5">
      <p className="text-[10px] uppercase tracking-wide text-foreground/45">
        {props.label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{props.value}</p>
    </div>
  );
}

function Sparkline({ daily }: { daily: DailyPoint[] }) {
  const counts = daily.map((d) => d.count);
  const max = Math.max(1, ...counts);
  return (
    <>
      <div className="mt-4 flex h-24 items-end gap-1">
        {daily.map((d, i) => {
          const h = max === 0 ? 0 : (d.count / max) * 100;
          return (
            <div
              key={i}
              title={`${d.day} · ${d.count} receipts · $${fmtUsdc(d.volume_lamports)}`}
              className="flex-1 rounded-sm bg-accent/40 hover:bg-accent"
              style={{ height: `${Math.max(2, h)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-foreground/40">
        <span>{daily[0]?.day ?? ""}</span>
        <span>{daily[daily.length - 1]?.day ?? ""}</span>
      </div>
    </>
  );
}
