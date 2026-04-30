"use client";

import { useEffect, useState } from "react";
import { ActivityRow, type ActivityRowProps } from "@settle/ui";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "../../lib/supabase";
import { lamportsToUsdc, timeAgo } from "../../lib/format";
import { getSolscanUrl } from "../../lib/solana";

interface PolicyDecisionRow {
  id: number;
  card_pubkey: string;
  merchant_pubkey: string | null;
  pact_pubkey: string | null;
  decision: "ALLOW" | "DENY" | "REVIEW";
  deny_code: number | null;
  amount_lamports: string;
  sig_solscan: string | null;
  slot: number;
  created_at: string;
}

function rowToProps(r: PolicyDecisionRow): ActivityRowProps {
  return {
    card: `${r.card_pubkey.slice(0, 6)}…${r.card_pubkey.slice(-4)}`,
    merchant: r.merchant_pubkey
      ? `${r.merchant_pubkey.slice(0, 6)}…${r.merchant_pubkey.slice(-4)}`
      : "—",
    amountUsdc: `$${lamportsToUsdc(r.amount_lamports)}`,
    decision: r.decision,
    ...(r.deny_code !== null && r.deny_code !== undefined ? { denyCode: r.deny_code } : {}),
    ts: timeAgo(r.created_at),
    ...(r.sig_solscan ? { solscanHref: getSolscanUrl(r.sig_solscan) } : {}),
  };
}

export default function ActivityPage() {
  const [rows, setRows] = useState<ActivityRowProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function init() {
      // 1. Initial fetch
      try {
        const res = await fetch("/api/feed?limit=20");
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setRows((data.events as PolicyDecisionRow[]).map(rowToProps));
          setError(null);
        } else {
          setError(data.error ?? "fetch_failed");
        }
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }

      // 2. Realtime subscription via Supabase
      try {
        const supabase = supabaseBrowser();
        channel = supabase
          .channel("policy_decisions:public")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "policy_decisions" },
            (payload) => {
              const r = payload.new as PolicyDecisionRow;
              setRows((prev) => [rowToProps(r), ...prev].slice(0, 50));
            },
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED" && !cancelled) setLive(true);
          });
      } catch {
        // Supabase not configured — already shown via error state
      }
    }

    void init();
    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-2 text-sm text-foreground/60">
            Live agent work. Helius RPC WebSocket onLogs → indexer → Supabase Realtime → here.
          </p>
        </div>
        {live && (
          <div className="flex items-center gap-2 text-xs text-accent">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Live
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-16 animate-pulse rounded-2xl border border-foreground/10 bg-white/[0.02]" />
          <div className="h-16 animate-pulse rounded-2xl border border-foreground/10 bg-white/[0.02]" />
        </div>
      ) : error === "supabase_unconfigured" ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-300">
          Supabase not configured. Apply migrations + run the indexer
          (<code>pnpm dev:indexer</code>) to start receiving events.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-6 text-sm text-foreground/60">
          No activity yet. Hire an agent on{" "}
          <a className="text-accent hover:underline" href="/agents">
            /agents
          </a>{" "}
          to start.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <ActivityRow key={i} {...row} />
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-foreground/40">
        Subscribed to <code>postgres_changes</code> on <code>policy_decisions</code> table.
        Inserts written by <code>@settle/indexer</code> as they land on Solana devnet.
      </p>
    </main>
  );
}
