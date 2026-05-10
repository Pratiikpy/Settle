"use client";

import { useEffect, useState } from "react";
import { lamportsToUsdc, timeAgo } from "../../lib/format";
import { getSolscanUrl } from "../../lib/solana";
import { W6AppShell } from "../../components/w6-app-shell";

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
    <W6AppShell forceSurface="public">
      <div style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 24 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Public · live feed
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Live agent activity.
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
            Public spends streamed from the on-chain program. Each row is a
            real receipt — verifiable without a wallet.
          </p>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="w6-card animate-pulse"
                style={{ height: 64 }}
              />
            ))}
          </div>
        ) : error === "supabase_unconfigured" ? (
          <div
            className="w6-card"
            style={{ padding: 16, borderColor: "var(--w6-warn-cluster)" }}
          >
            Supabase not configured. Run the indexer to start receiving
            events.
          </div>
        ) : events.length === 0 ? (
          <div
            className="w6-card"
            style={{ padding: 32, textAlign: "center" }}
          >
            <p className="w6-muted" style={{ fontSize: 13, marginBottom: 6 }}>
              No public events yet
            </p>
            <p
              className="w6-muted"
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                maxWidth: 480,
                margin: "0 auto 16px",
              }}
            >
              Receipts are private by default. Senders opt in to publish
              one here when they share it — that way the public feed shows
              real on-chain activity from people who chose to share, not
              everyone's private history.
            </p>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <a
                href="/watch"
                className="w6-btn w6-btn-secondary"
                style={{ fontSize: 13 }}
              >
                Watch the live agent ledger →
              </a>
              <a
                href="/leaderboard"
                className="w6-btn w6-btn-ghost"
                style={{ fontSize: 13 }}
              >
                Browse the capability heatmap →
              </a>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {events.map((event) => (
              <div
                key={event.id}
                className="w6-card-flat"
                style={{ padding: 16 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 13 }}>
                    <span
                      className="w6-mono w6-muted"
                      style={{ fontSize: 11.5 }}
                    >
                      {event.card_pubkey.slice(0, 6)}…
                    </span>{" "}
                    <span className="w6-muted">→</span>{" "}
                    <span className="w6-mono" style={{ fontSize: 11.5 }}>
                      {(event.merchant_pubkey ?? "").slice(0, 6)}…
                    </span>
                  </div>
                  <div className="w6-muted" style={{ fontSize: 11.5 }}>
                    {timeAgo(event.created_at)}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12,
                  }}
                >
                  <span
                    className="w6-mono"
                    style={{
                      fontWeight: 600,
                      color:
                        event.decision === "ALLOW"
                          ? "var(--w6-ok)"
                          : "var(--w6-bad)",
                    }}
                  >
                    ${lamportsToUsdc(event.amount_lamports)}
                  </span>
                  {event.sig_solscan && (
                    <a
                      href={getSolscanUrl(event.sig_solscan)}
                      target="_blank"
                      rel="noreferrer"
                      className="w6-muted"
                      style={{ textDecoration: "none" }}
                    >
                      Solscan ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </W6AppShell>
  );
}
