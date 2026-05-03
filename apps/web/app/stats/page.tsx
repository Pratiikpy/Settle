"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { W6AppShell } from "../../components/w6-app-shell";

/**
 * F9.4 — Public stats / transparency page.
 *
 * Reads /api/stats (60s server-cached) and renders the network's health
 * at a glance. No auth, no paywall — verifiable money is verifiable in
 * aggregate too.
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
  cached?: boolean;
}

function fmtUsdc(lamports: string): string {
  const n = Number(lamports);
  return (n / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function StatsPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/stats")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j as StatsResponse);
        else setErr(j.message ?? j.error ?? "fetch_failed");
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <W6AppShell forceSurface="public">
      <div style={{ maxWidth: 980 }}>
        <div style={{ marginBottom: 28 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Public · transparency
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Settle network · live counters.
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 640,
              lineHeight: 1.5,
            }}
          >
            Network health at a glance. No auth, no per-user data — aggregate
            counters of verifiable money on Solana. Cached for 60s; backing
            query is auditable in the source.
          </p>
        </div>

        {loading && (
          <p className="mt-8 text-sm text-[#52525b]">Loading…</p>
        )}

        {err && (
          <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5 text-sm text-red-300">
            {err}
          </div>
        )}

        {data && (
          <>
            {/* Top-line counters */}
            <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Counter
                label="Receipts · 24h"
                value={data.receipts.day.toLocaleString()}
              />
              <Counter
                label="Receipts · all-time"
                value={data.receipts.all_time.toLocaleString()}
              />
              <Counter
                label="USDC moved · 24h"
                value={`$${fmtUsdc(data.usd_volume_lamports.day)}`}
              />
              <Counter
                label="Merchants · 7d"
                value={data.merchants_serving_week.toLocaleString()}
              />
            </section>

            <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Counter
                label="USDC · 7d"
                value={`$${fmtUsdc(data.usd_volume_lamports.week)}`}
                muted
              />
              <Counter
                label="USDC · all-time"
                value={`$${fmtUsdc(data.usd_volume_lamports.all_time)}`}
                muted
              />
              <Counter
                label="On-chain attests · 24h"
                value={data.on_chain_attestations_day.toLocaleString()}
                muted
              />
              <Counter
                label="Cluster"
                value={data.cluster}
                muted
                mono
              />
            </section>

            {/* Histograms */}
            <section className="mt-10 grid gap-6 md:grid-cols-2">
              <Histogram
                title="By kind · 24h"
                items={data.kind_histogram_day}
              />
              <Histogram
                title="By decision · 24h"
                items={data.decision_histogram_day}
              />
            </section>

            {/* Top capabilities */}
            <section className="mt-10 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
              <h2 className="text-sm font-medium">Top capabilities · 7d</h2>
              {data.top_capabilities_week.length === 0 ? (
                <p className="mt-3 text-xs text-[#71717a]">
                  No capability hashes recorded yet.
                </p>
              ) : (
                <table className="mt-4 w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#e4e4e7] text-left text-[10px] uppercase tracking-wide text-[#71717a]">
                      <th className="py-2 pr-3">capability</th>
                      <th className="py-2 px-3 text-right">calls</th>
                      <th className="py-2 pl-3 text-right">volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_capabilities_week.map((c) => (
                      <tr key={c.capability_hash} className="border-b border-[#f4f4f5]">
                        <td className="py-2 pr-3">
                          {c.alias ? (
                            <span className="font-medium text-[#27272a]">
                              {c.alias}
                            </span>
                          ) : (
                            <Link
                              href={`/capabilities?h=${c.capability_hash}`}
                              className="font-mono text-[#52525b] hover:text-[#09090b]"
                            >
                              {c.capability_hash.slice(0, 12)}…
                            </Link>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[#09090b]/65">
                          {c.count}
                        </td>
                        <td className="py-2 pl-3 text-right font-mono text-[#09090b]/65">
                          ${fmtUsdc(c.volume_lamports)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <p className="mt-8 text-[10px] text-[#71717a]">
              Generated {new Date(data.generated_at).toLocaleTimeString()}{" "}
              · {data.cached ? "served from 60s cache" : "fresh query"} ·{" "}
              <Link
                href="/api/stats"
                className="hover:text-[#09090b]"
              >
                /api/stats
              </Link>
            </p>
          </>
        )}
      </div>
    </W6AppShell>
  );
}

function Counter(props: {
  label: string;
  value: string;
  muted?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className={props.muted ? "w6-card-flat" : "w6-card"}
      style={{ padding: 20 }}
    >
      <div className="w6-eyebrow" style={{ fontSize: 11 }}>
        {props.label}
      </div>
      <div
        className={`w6-heading ${props.mono ? "w6-mono" : ""}`}
        style={{
          marginTop: 8,
          fontSize: 26,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

function Histogram({
  title,
  items,
}: {
  title: string;
  items: Record<string, number>;
}) {
  const total = Object.values(items).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(items).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
      <h3 className="text-sm font-medium">{title}</h3>
      {total === 0 ? (
        <p className="mt-3 text-xs text-[#71717a]">No data yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {sorted.map(([k, v]) => {
            const pct = total === 0 ? 0 : (v / total) * 100;
            return (
              <li key={k} className="text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[#09090b]/75">{k}</span>
                  <span className="text-[#52525b]">
                    {v} · {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e4e4e7]">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
