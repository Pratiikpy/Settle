"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Footer } from "../../components/footer";
import { CapabilityHeatmap } from "../../components/capability-heatmap";
import { lamportsToUsdc, timeAgo } from "../../lib/format";

/**
 * Top capability hashes by total volume across all merchants. Each row links to the
 * per-capability leaderboard at /leaderboard/[capabilityHash].
 */

interface Row {
  capability_hash: string;
  total_volume: string;
  completed: number;
  merchant_count: number;
  last_used_at: string;
}

function hashHexFromBytea(s: string): string {
  // Supabase returns bytea as `\x...`. Strip the `\x` prefix for URL/display.
  return s.startsWith("\\x") ? s.slice(2) : s;
}

export default function LeaderboardIndexPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/leaderboard`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (r.ok) setRows(data.capabilities ?? []);
        else setError(data.error ?? "fetch_failed");
      })
      .catch((e) => {
        if (!cancelled) setError(String((e as Error).message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Capability leaderboard</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Top services by real public_feed volume. The audit data is the marketing
          surface — every number comes straight from on-chain receipts.
        </p>

        {/* Live market view — sits above the all-time top list. Realtime feed
            of the last 60s of ALLOW receipts as a glowing grid. */}
        <div className="mt-6">
          <CapabilityHeatmap />
        </div>

        <h2 className="mt-12 text-base font-medium tracking-tight">All-time leaders</h2>

        {error ? (
          <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm">
            {error}
          </div>
        ) : rows == null ? (
          <div className="mt-8 h-32 animate-pulse rounded-2xl border border-foreground/10 bg-white/[0.02]" />
        ) : rows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-foreground/10 bg-white/[0.02] p-8 text-sm text-foreground/60">
            No capabilities have public_feed completions yet. Once a merchant earns
            their first ALLOW receipt with public_feed=true, this list lights up.
          </div>
        ) : (
          <ul className="mt-8 space-y-2">
            {rows.map((r, i) => {
              const hashHex = hashHexFromBytea(r.capability_hash);
              return (
                <li key={hashHex}>
                  <Link
                    href={`/leaderboard/${hashHex}`}
                    className="flex items-center justify-between rounded-2xl border border-foreground/10 p-5 transition hover:bg-foreground/[0.03]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-wider text-foreground/40">
                        #{i + 1}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-foreground/70">
                        {hashHex.slice(0, 12)}…{hashHex.slice(-8)}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-6 text-right text-xs">
                      <div>
                        <div className="text-foreground/40">Volume</div>
                        <div className="font-mono">${lamportsToUsdc(r.total_volume)}</div>
                      </div>
                      <div>
                        <div className="text-foreground/40">Completed</div>
                        <div className="font-mono">{r.completed}</div>
                      </div>
                      <div>
                        <div className="text-foreground/40">Last</div>
                        <div className="font-mono">{timeAgo(r.last_used_at)}</div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-12 text-[11px] text-foreground/40">
          Capabilities are identified by BLAKE3-hashed canonical specs (domain + method +
          path + amount + version). Two services with the same capability are directly
          comparable.
        </p>
      </main>
      <Footer />
    </>
  );
}
