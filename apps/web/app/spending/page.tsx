"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { W6AppShell } from "../../components/w6-app-shell";

interface Insights {
  total_usdc: string;
  since_days: number;
  by_category: Record<string, string>;
  by_merchant: Array<{ pubkey: string; name: string; amount_usdc: string; count: number }>;
  daily_series: Array<{ date: string; amount_usdc: string }>;
  top_merchant: { name: string; amount_usdc: string } | null;
}

interface ForecastAlert {
  rule: string;
  severity: "info" | "warn" | "critical";
  message: string;
}
interface ForecastSummary {
  total30d_lamports: string;
  avg_per_day_lamports: string;
  avg7d_lamports: string;
  projected_next7d_lamports: string;
  total_daily_cap_lamports: string;
}
interface ForecastResponse {
  ok: boolean;
  summary?: ForecastSummary | null;
  alerts?: ForecastAlert[];
}

interface FraudFlag {
  rule: string;
  score: number;
  context: Record<string, unknown>;
}

function lamportsToUsdc(s: string): string {
  return (Number(s) / 1e6).toFixed(2);
}

export default function SpendingPage() {
  const { connected, publicKey } = useWallet();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  // F33.3 — burn-rate forecast surfaced inline.
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  // F29.4 — fraud flags from a fresh scan.
  const [fraudFlags, setFraudFlags] = useState<FraudFlag[]>([]);
  const [fraudLoading, setFraudLoading] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey) return;
    setLoading(true);
    void fetch(`/api/spending/insights?authority=${publicKey.toBase58()}&since_days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setInsights(data);
      })
      .finally(() => setLoading(false));
  }, [connected, publicKey, days]);

  // Lazy-fetch forecast (independent of the spending insights query so a
  // slow forecast doesn't block the existing dashboard).
  useEffect(() => {
    if (!connected || !publicKey) return;
    void fetch(`/api/spend/forecast?pubkey=${publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((j: ForecastResponse) => setForecast(j))
      .catch(() => setForecast(null));
  }, [connected, publicKey]);

  async function runFraudScan() {
    if (!connected || !publicKey) return;
    setFraudLoading(true);
    try {
      const r = await fetch("/api/fraud/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: publicKey.toBase58() }),
      });
      const j = await r.json();
      setFraudFlags(j.flags ?? []);
    } catch {
      setFraudFlags([]);
    } finally {
      setFraudLoading(false);
    }
  }

  const maxDailyAmount = insights
    ? Math.max(...insights.daily_series.map((d) => parseFloat(d.amount_usdc)), 0.01)
    : 0;

  return (
    <W6AppShell>
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="w6-heading" style={{ fontSize: 32, lineHeight: 1.1, margin: 0 }}>Spending</h1>
          <p className="w6-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Where your AI agents and you have been spending.
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-1.5 text-xs"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      {!connected ? (
        <div className="mt-12 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-10 text-center text-sm text-[#52525b]">
          Connect a wallet to see your spending.
        </div>
      ) : loading ? (
        <div className="mt-12 grid gap-4">
          <div className="h-32 animate-pulse rounded-2xl border border-[#e4e4e7] bg-white/[0.02]" />
          <div className="h-48 animate-pulse rounded-2xl border border-[#e4e4e7] bg-white/[0.02]" />
        </div>
      ) : !insights || parseFloat(insights.total_usdc) === 0 ? (
        <div className="mt-12 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-10 text-center text-sm text-[#52525b]">
          No spending in the selected window. Hire an agent or send a payment to start.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* F33.3 — Burn-rate forecast + alerts. Renders only when the
              forecast endpoint returned a summary AND there's something
              meaningful to show (skip on brand-new wallets). */}
          {forecast?.ok && forecast.summary && Number(forecast.summary.total30d_lamports) > 0 && (
            <div className="rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-6">
              <h2 className="text-sm font-medium uppercase tracking-wider text-[#52525b]">
                Burn-rate forecast
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat
                  label="Avg / day"
                  value={`$${lamportsToUsdc(forecast.summary.avg_per_day_lamports)}`}
                />
                <Stat
                  label="Last 7 avg"
                  value={`$${lamportsToUsdc(forecast.summary.avg7d_lamports)}`}
                />
                <Stat
                  label="Next 7 (proj)"
                  value={`$${lamportsToUsdc(forecast.summary.projected_next7d_lamports)}`}
                />
                <Stat
                  label="Daily cap (sum)"
                  value={
                    Number(forecast.summary.total_daily_cap_lamports) > 0
                      ? `$${lamportsToUsdc(forecast.summary.total_daily_cap_lamports)}`
                      : "—"
                  }
                />
              </div>
              {forecast.alerts && forecast.alerts.length > 0 && (
                <ul className="mt-5 space-y-2 text-xs">
                  {forecast.alerts.map((a) => (
                    <li
                      key={a.rule}
                      className={
                        a.severity === "critical"
                          ? "rounded-xl border border-red-500/30 bg-red-500/[0.05] p-3 text-red-300"
                          : a.severity === "warn"
                            ? "rounded-xl border border-amber-400/30 bg-amber-400/[0.05] p-3 text-amber-300"
                            : "rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3 text-[#27272a]"
                      }
                    >
                      <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                        {a.rule}
                      </span>
                      <span className="ml-2">{a.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* F29.4 — Run-on-demand fraud scan. */}
          <div className="rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wider text-[#52525b]">
                Anomaly scan
              </h2>
              <button
                type="button"
                onClick={() => void runFraudScan()}
                disabled={fraudLoading}
                className="rounded-full bg-[#e4e4e7] px-4 py-1 text-xs font-medium hover:bg-[#a1a1aa] disabled:opacity-50"
              >
                {fraudLoading ? "scanning…" : "Run scan"}
              </button>
            </div>
            {fraudFlags.length === 0 && !fraudLoading && (
              <p className="mt-3 text-xs text-[#52525b]">
                Click "Run scan" to check the last 30 days for spend spikes,
                novel merchants, deny clusters, and off-hours bursts.
              </p>
            )}
            {fraudFlags.length > 0 && (
              <ul className="mt-4 space-y-2 text-xs">
                {fraudFlags.map((f, i) => (
                  <li
                    key={`${f.rule}-${i}`}
                    className="rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-amber-300">
                        {f.rule}
                      </span>
                      <span className="text-[#52525b]">
                        score {(f.score * 100).toFixed(0)}/100
                      </span>
                    </div>
                    <pre className="mt-2 overflow-x-auto text-[10px] text-[#52525b]">
                      {JSON.stringify(f.context, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Total */}
          <div className="rounded-2xl border border-[#e4e4e7] bg-card-gradient p-8 card-surface">
            <div className="text-xs font-medium uppercase tracking-wider text-[#52525b]">
              Total
            </div>
            <div className="mt-2 text-5xl font-semibold tracking-tight">
              ${insights.total_usdc}
            </div>
            <div className="mt-1 text-xs text-[#71717a]">
              over the last {insights.since_days} days
            </div>
          </div>

          {/* By category */}
          <div>
            <h2 className="text-lg font-medium">By category</h2>
            <div className="mt-4 space-y-2">
              {Object.entries(insights.by_category).map(([cat, amount]) => {
                const pct = (parseFloat(amount) / parseFloat(insights.total_usdc)) * 100;
                return (
                  <div key={cat} className="rounded-xl border border-[#e4e4e7] p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">{cat}</span>
                      <span className="font-mono">${amount}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f4f4f5]">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily series — simple bar chart */}
          <div>
            <h2 className="text-lg font-medium">Daily</h2>
            <div className="mt-4 flex h-32 items-end gap-1 rounded-xl border border-[#e4e4e7] p-3">
              {insights.daily_series.map((d) => {
                const pct = (parseFloat(d.amount_usdc) / maxDailyAmount) * 100;
                return (
                  <div
                    key={d.date}
                    className="group flex-1 rounded-sm bg-accent/40 transition hover:bg-accent"
                    style={{ height: `${Math.max(pct, 3)}%` }}
                    title={`${d.date}: $${d.amount_usdc}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-[#71717a]">
              <span>{insights.daily_series[0]?.date ?? ""}</span>
              <span>{insights.daily_series[insights.daily_series.length - 1]?.date ?? ""}</span>
            </div>
          </div>

          {/* By merchant */}
          <div>
            <h2 className="text-lg font-medium">By merchant</h2>
            <div className="mt-4 space-y-2">
              {insights.by_merchant.slice(0, 10).map((m) => (
                <div
                  key={m.pubkey}
                  className="flex items-center justify-between rounded-xl border border-[#e4e4e7] p-4"
                >
                  <div>
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-[10px] text-[#71717a] font-mono">
                      {m.pubkey.slice(0, 6)}…{m.pubkey.slice(-4)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">${m.amount_usdc}</div>
                    <div className="text-[10px] text-[#71717a]">{m.count} payments</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="w6-muted" style={{ marginTop: 48, fontSize: 12 }}>
        Categorization heuristic-based on merchant name in V1. V2 wires LLM categorization
        over receipt purpose text.
      </p>
    </div>
    </W6AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
