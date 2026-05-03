"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { W6AppShell } from "../../../components/w6-app-shell";
import { lamportsToUsdc } from "../../../lib/format";
import { getSolscanAccountUrl } from "../../../lib/solana";

/**
 * F17 — Public capability leaderboard for a given capability_hash.
 *
 * Ranked merchants serving this capability, sorted by total volume. Every metric is
 * server-clock consistent (P10). Latency reported in two columns:
 *   total: entry-to-exit through the proxy (what users feel)
 *   merch: upstream-only (the merchant's actual service speed)
 *
 * The leaderboard IS the marketing surface: the audit data is the pitch.
 */

interface Row {
  merchant_pubkey: string;
  handle: string | null;
  completed: number;
  avg_total_latency_ms: string | null;
  avg_merchant_latency_ms: string | null;
  avg_amount_lamports: string | null;
  total_volume: string;
  unique_users: number;
  last_used_at: string;
}

export default function CapabilityLeaderboardPage() {
  const params = useParams<{ capabilityHash: string }>();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.capabilityHash) return;
    let cancelled = false;
    void fetch(`/api/leaderboard/${params.capabilityHash}`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (r.ok) setRows(data.merchants ?? []);
        else setError(data.error ?? "fetch_failed");
      })
      .catch((e) => {
        if (!cancelled) setError(String((e as Error).message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [params.capabilityHash]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Leaderboard unavailable</h1>
        <p className="mt-3 text-sm text-[#52525b]">{error}</p>
      </main>
    );
  }

  return (
    <W6AppShell forceSurface="public">
      <div style={{ maxWidth: 880 }}>
        <Link href="/leaderboard" className="text-xs text-[#71717a] hover:text-accent">
          ← All capabilities
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Capability leaderboard</h1>
        <div className="mt-1 break-all font-mono text-[10px] text-[#71717a]">
          {params.capabilityHash}
        </div>
        <p className="mt-3 text-sm text-[#52525b]">
          Real-measured performance per merchant for this capability hash. Latencies are
          server-clock consistent. The audit data is the marketing surface.
        </p>

        {rows == null ? (
          <div className="mt-8 h-32 animate-pulse rounded-2xl border border-[#e4e4e7] bg-[#fafafa]" />
        ) : rows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-8 text-sm text-[#52525b]">
            No public-feed completions yet for this capability. Merchants appear here
            after at least one ALLOW receipt with public_feed=true.
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-2xl border border-[#e4e4e7]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-xs uppercase tracking-wider text-[#52525b]">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3 text-right">Completed</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3 text-right">Total p50</th>
                  <th className="px-4 py-3 text-right">Merch p50</th>
                  <th className="px-4 py-3 text-right">Users</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {rows.map((r, i) => (
                  <tr key={r.merchant_pubkey} className="hover:bg-[#fafafa]">
                    <td className="px-4 py-3 font-mono text-xs text-[#71717a]">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3">
                      {r.handle ? (
                        <Link
                          href={`/at/${r.handle}`}
                          className="font-medium text-accent hover:underline"
                        >
                          @{r.handle}
                        </Link>
                      ) : (
                        <a
                          href={getSolscanAccountUrl(r.merchant_pubkey)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-[#27272a] hover:text-accent"
                        >
                          {r.merchant_pubkey.slice(0, 6)}…{r.merchant_pubkey.slice(-4)}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{r.completed}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      ${lamportsToUsdc(r.total_volume)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {r.avg_total_latency_ms != null
                        ? `${Number(r.avg_total_latency_ms).toFixed(0)}ms`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {r.avg_merchant_latency_ms != null
                        ? `${Number(r.avg_merchant_latency_ms).toFixed(0)}ms`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {r.unique_users}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-[11px] text-[#71717a]">
          Total p50 = full proxy roundtrip (entry → settle). Merch p50 = upstream call
          only. Pre-P10 receipts (no timing data) are excluded honestly — never imputed.
        </p>
      </div>
    </W6AppShell>
  );
}
