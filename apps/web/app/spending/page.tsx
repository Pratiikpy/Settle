"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface Insights {
  total_usdc: string;
  since_days: number;
  by_category: Record<string, string>;
  by_merchant: Array<{ pubkey: string; name: string; amount_usdc: string; count: number }>;
  daily_series: Array<{ date: string; amount_usdc: string }>;
  top_merchant: { name: string; amount_usdc: string } | null;
}

export default function SpendingPage() {
  const { connected, publicKey } = useWallet();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

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

  const maxDailyAmount = insights
    ? Math.max(...insights.daily_series.map((d) => parseFloat(d.amount_usdc)), 0.01)
    : 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Spending</h1>
          <p className="mt-2 text-sm text-foreground/60">
            Where your AI agents and you have been spending.
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-1.5 text-xs"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      {!connected ? (
        <div className="mt-12 rounded-2xl border border-foreground/10 bg-white/[0.02] p-10 text-center text-sm text-foreground/60">
          Connect Phantom (top right) to see your spending.
        </div>
      ) : loading ? (
        <div className="mt-12 grid gap-4">
          <div className="h-32 animate-pulse rounded-2xl border border-foreground/10 bg-white/[0.02]" />
          <div className="h-48 animate-pulse rounded-2xl border border-foreground/10 bg-white/[0.02]" />
        </div>
      ) : !insights || parseFloat(insights.total_usdc) === 0 ? (
        <div className="mt-12 rounded-2xl border border-foreground/10 bg-white/[0.02] p-10 text-center text-sm text-foreground/60">
          No spending in the selected window. Hire an agent or send a payment to start.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* Total */}
          <div className="rounded-2xl border border-foreground/10 bg-card-gradient p-8 card-surface">
            <div className="text-xs font-medium uppercase tracking-wider text-foreground/50">
              Total
            </div>
            <div className="mt-2 text-5xl font-semibold tracking-tight">
              ${insights.total_usdc}
            </div>
            <div className="mt-1 text-xs text-foreground/40">
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
                  <div key={cat} className="rounded-xl border border-foreground/10 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">{cat}</span>
                      <span className="font-mono">${amount}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/5">
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
            <div className="mt-4 flex h-32 items-end gap-1 rounded-xl border border-foreground/10 p-3">
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
            <div className="mt-2 flex justify-between text-[10px] text-foreground/40">
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
                  className="flex items-center justify-between rounded-xl border border-foreground/10 p-4"
                >
                  <div>
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-[10px] text-foreground/40 font-mono">
                      {m.pubkey.slice(0, 6)}…{m.pubkey.slice(-4)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">${m.amount_usdc}</div>
                    <div className="text-[10px] text-foreground/40">{m.count} payments</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="mt-12 text-xs text-foreground/40">
        Categorization heuristic-based on merchant name in V1. V2 wires LLM categorization
        over receipt purpose text.
      </p>
    </main>
  );
}
