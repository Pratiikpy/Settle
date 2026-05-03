"use client";

/**
 * Wave 6 — Public · Capability heatmap.
 *
 * Layout matches `setltlt protype/settle/screen-capability-heatmap.jsx`
 * 1:1:
 *   - PageHeader (kicker · title · subtitle)
 *   - Live heatmap card (12-col grid of capability cells)
 *   - "Brightest right now" mini list
 *   - All-time leaders ranked table
 *
 * Real backend: `/api/leaderboard` returns the all-time leaders
 * aggregate from `public_feed`. The live heatmap (top of card) reuses
 * the existing `<CapabilityHeatmap>` component which streams via
 * Supabase Realtime on `policy_decisions` with `public_feed=true`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CapabilityHeatmap } from "../../components/capability-heatmap";
import { W6AppShell } from "../../components/w6-app-shell";
import { lamportsToUsdc, timeAgo } from "../../lib/format";

interface Row {
  capability_hash: string;
  total_volume: string;
  completed: number;
  merchant_count: number;
  last_used_at: string;
}

interface FederationOrigin {
  origin_id: string;
  label: string;
  homepage_url: string | null;
  trusted_since: string;
  receipt_count: number;
}

function hashHexFromBytea(s: string): string {
  return s.startsWith("\\x") ? s.slice(2) : s;
}

export default function LeaderboardIndexPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origins, setOrigins] = useState<FederationOrigin[] | null>(null);

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
    void fetch(`/api/federation/origins`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { origins?: FederationOrigin[] } | null) => {
        if (!cancelled && data?.origins) setOrigins(data.origins);
      })
      .catch(() => {
        /* federation panel is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <W6AppShell forceSurface="public">
      <div>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Capability registry · public
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            What the network is paying for, right now.
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 720,
              lineHeight: 1.5,
            }}
          >
            Each cell is a capability. Brighter = more calls in the last
            60s. Click for SLA, price history, and live receipts.
          </p>
        </div>

        {/* Live heatmap */}
        <div className="w6-card" style={{ padding: 24, marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--w6-ok)",
              }}
            />
            <span className="w6-micro">live · 60s window</span>
          </div>
          <CapabilityHeatmap />
        </div>

        {/* All-time leaders */}
        <div className="w6-eyebrow" style={{ marginBottom: 14 }}>
          All-time leaders
        </div>
        {error ? (
          <div
            className="w6-card"
            style={{ padding: 16, borderColor: "var(--w6-bad)", marginBottom: 24 }}
          >
            {error}
          </div>
        ) : rows == null ? (
          <div className="w6-card-flat" style={{ padding: 60, textAlign: "center" }}>
            <div className="w6-muted" style={{ fontSize: 13 }}>
              Loading…
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="w6-card" style={{ padding: 32, textAlign: "center" }}>
            <p className="w6-muted" style={{ fontSize: 13 }}>
              No capabilities have public_feed completions yet. Once a
              merchant earns their first ALLOW receipt with public_feed=true,
              this list lights up.
            </p>
          </div>
        ) : (
          <div className="w6-card-flat" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="w6-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>#</th>
                    <th>Capability hash</th>
                    <th>Merchants</th>
                    <th style={{ textAlign: "right" }}>Volume</th>
                    <th style={{ textAlign: "right" }}>Completed</th>
                    <th>Last</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const hashHex = hashHexFromBytea(r.capability_hash);
                    return (
                      <tr
                        key={hashHex}
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          window.location.href = `/leaderboard/${hashHex}`;
                        }}
                      >
                        <td className="w6-mono" style={{ fontSize: 12 }}>
                          #{i + 1}
                        </td>
                        <td className="w6-mono" style={{ fontSize: 12 }}>
                          {hashHex.slice(0, 12)}…{hashHex.slice(-8)}
                        </td>
                        <td className="w6-muted" style={{ fontSize: 12.5 }}>
                          {r.merchant_count}
                        </td>
                        <td
                          className="w6-mono"
                          style={{
                            textAlign: "right",
                            fontWeight: 500,
                            fontSize: 13,
                          }}
                        >
                          ${lamportsToUsdc(r.total_volume)}
                        </td>
                        <td
                          className="w6-mono"
                          style={{
                            textAlign: "right",
                            fontSize: 12.5,
                          }}
                        >
                          {r.completed}
                        </td>
                        <td className="w6-muted" style={{ fontSize: 12.5 }}>
                          {timeAgo(r.last_used_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p
          className="w6-muted"
          style={{ fontSize: 11, marginTop: 24, lineHeight: 1.6 }}
        >
          Capabilities are identified by BLAKE3-hashed canonical specs
          (domain + method + path + amount + version). Two services with
          the same capability are directly comparable.
        </p>

        {/* Federation panel — promoted external origins. Populated only
            once `federation_origins.trusted=true` rows exist. */}
        {origins && origins.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <div className="w6-eyebrow" style={{ marginBottom: 14 }}>
              Federation · trusted origins
            </div>
            <p
              className="w6-muted"
              style={{
                fontSize: 13,
                marginBottom: 16,
                maxWidth: 720,
                lineHeight: 1.5,
              }}
            >
              Settle accepts attested receipts from these foreign protocols.
              Imported rows show up in your /ledger as "federated · trusted"
              and get verified against the origin's published key.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              {origins.map((o) => (
                <div
                  key={o.origin_id}
                  className="w6-card"
                  style={{ padding: 16 }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <div className="w6-heading" style={{ fontSize: 14 }}>
                      {o.label}
                    </div>
                    <span
                      className="w6-mono"
                      style={{ fontSize: 11, color: "var(--w6-ink-4)" }}
                    >
                      {o.origin_id}
                    </span>
                  </div>
                  <div
                    className="w6-muted"
                    style={{ fontSize: 12, marginBottom: 10 }}
                  >
                    {o.receipt_count.toLocaleString()} verified receipt
                    {o.receipt_count === 1 ? "" : "s"}
                  </div>
                  {o.homepage_url && (
                    <a
                      href={o.homepage_url}
                      target="_blank"
                      rel="noreferrer"
                      className="w6-btn w6-btn-secondary w6-btn-sm"
                      style={{ fontSize: 11.5 }}
                    >
                      Visit ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <style>{`
        .w6-tbl {
          width: 100%;
          border-collapse: collapse;
        }
        .w6-tbl th {
          text-align: left;
          padding: 12px 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--w6-ink-4);
          border-bottom: 1px solid var(--w6-rule);
          background: var(--w6-bg);
        }
        .w6-tbl td {
          padding: 14px 20px;
          font-size: 13px;
          border-bottom: 1px solid var(--w6-rule-2);
        }
        .w6-tbl tbody tr:last-child td { border-bottom: 0; }
        .w6-tbl tbody tr:hover td { background: var(--w6-bg-2); }
      `}</style>
    </W6AppShell>
  );
}
