"use client";

import { useEffect, useState } from "react";
import { lamportsToUsdc, timeAgo } from "../../lib/format";
import { getSolscanUrl } from "../../lib/solana";

interface FeedEvent {
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

export default function FeedPage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/feed?limit=50")
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (r.ok) {
          setEvents(data.events ?? []);
          setError(null);
        } else {
          setError(data.error ?? "fetch_failed");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String((e as Error).message ?? e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Live</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Public agent activity. Toggle privacy on any of your own cards.
      </p>

      {loading ? (
        <div className="mt-8 grid gap-3">
          <div className="h-16 animate-pulse rounded-xl border border-foreground/10 bg-white/[0.02]" />
          <div className="h-16 animate-pulse rounded-xl border border-foreground/10 bg-white/[0.02]" />
          <div className="h-16 animate-pulse rounded-xl border border-foreground/10 bg-white/[0.02]" />
        </div>
      ) : error === "supabase_unconfigured" ? (
        <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-300">
          Supabase not configured. Apply migrations + run the indexer to start receiving events.
        </div>
      ) : events.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6 text-sm text-foreground/60">
          No public events yet. Agent activity will appear here as it happens.
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {events.map((event) => (
            <div key={event.id} className="rounded-xl border border-foreground/10 p-4">
              <div className="flex items-start justify-between">
                <div className="text-sm">
                  <span className="font-mono text-xs text-foreground/50">
                    {event.card_pubkey.slice(0, 6)}…
                  </span>{" "}
                  <span className="text-foreground/40">→</span>{" "}
                  <span className="font-mono text-xs">
                    {(event.merchant_pubkey ?? "").slice(0, 6)}…
                  </span>
                </div>
                <div className="text-xs text-foreground/40">
                  {timeAgo(event.created_at)}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-mono text-accent">
                  ${lamportsToUsdc(event.amount_lamports)}
                </span>
                {event.sig_solscan && (
                  <a
                    href={getSolscanUrl(event.sig_solscan)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground/40 hover:text-accent"
                  >
                    Solscan ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
