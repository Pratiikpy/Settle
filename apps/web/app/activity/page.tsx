"use client";

/**
 * Wave 6 — Activity feed.
 *
 * Layout matches `setltlt protype/settle/screen-activity.jsx` 1:1:
 *   - Header (Activity / "Every spend, sealed or denied." / Live pill +
 *     Export CSV)
 *   - Filter bar: segmented (All / Sealed / Denied) + card select +
 *     search
 *   - card-flat with table cols: Receipt · Card · Merchant · Pact ·
 *     Amount · Status · When · ↗
 *
 * Real backend: `/api/feed?limit=50` returns recent `policy_decisions`
 * rows. Realtime subscription on the same table keeps the feed live.
 * Card filter applies client-side over distinct `card_pubkey` values.
 * Export-CSV serializes the loaded rows in-browser.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { W6AppShell } from "../../components/w6-app-shell";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "../../lib/supabase";
import { lamportsToUsdc, timeAgo } from "../../lib/format";
import { getSolscanUrl } from "../../lib/solana";

interface DecisionRow {
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

type Filter = "all" | "sealed" | "denied";

function shortPubkey(p: string | null): string {
  if (!p) return "—";
  return `${p.slice(0, 4)}…${p.slice(-4)}`;
}

export default function ActivityPage() {
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  const [cardFilter, setCardFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    (async () => {
      try {
        const res = await fetch("/api/feed?limit=50");
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setRows((data.events ?? []) as DecisionRow[]);
          setError(null);
        } else {
          setError(data.error ?? "fetch_failed");
        }
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
      try {
        const supabase = supabaseBrowser();
        channel = supabase
          .channel("policy_decisions:public")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "policy_decisions" },
            (payload) => {
              const r = payload.new as DecisionRow;
              setRows((prev) => [r, ...prev].slice(0, 100));
            },
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED" && !cancelled) setLive(true);
          });
      } catch {
        /* unconfigured Supabase already shown via error */
      }
    })();
    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, []);

  const cardOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) seen.add(r.card_pubkey);
    return Array.from(seen);
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "sealed" && r.decision !== "ALLOW") return false;
      if (filter === "denied" && r.decision === "ALLOW") return false;
      if (cardFilter !== "all" && r.card_pubkey !== cardFilter) return false;
      if (q.trim()) {
        const s = q.toLowerCase();
        const hay = [
          String(r.id),
          r.card_pubkey,
          r.merchant_pubkey ?? "",
          r.pact_pubkey ?? "",
          r.sig_solscan ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, filter, cardFilter, q]);

  function exportCsv() {
    const cols = [
      "id",
      "decision",
      "deny_code",
      "card_pubkey",
      "merchant_pubkey",
      "pact_pubkey",
      "amount_usdc",
      "slot",
      "created_at",
      "sig_solscan",
    ];
    const lines = [cols.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.id,
          r.decision,
          r.deny_code ?? "",
          r.card_pubkey,
          r.merchant_pubkey ?? "",
          r.pact_pubkey ?? "",
          lamportsToUsdc(r.amount_lamports),
          r.slot,
          r.created_at,
          r.sig_solscan ?? "",
        ]
          .map((v) => String(v).replace(/,/g, ";"))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settle-receipts-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <W6AppShell>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 24,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Activity
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Every spend, sealed or denied.
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
            Live agent decisions via Helius onLogs → indexer → Supabase
            Realtime. Each row has a hash and a signature you can verify
            on-chain.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {live && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                background: "rgba(22, 163, 74, 0.1)",
                color: "var(--w6-ok)",
                fontSize: 12,
                fontWeight: 500,
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
              Live
            </span>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="w6-btn w6-btn-secondary w6-btn-sm"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 18,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            background: "#fff",
            borderRadius: 8,
            border: "1px solid var(--w6-rule)",
            overflow: "hidden",
          }}
        >
          {(
            [
              { id: "all", l: "All" },
              { id: "sealed", l: "Sealed" },
              { id: "denied", l: "Denied" },
            ] as const
          ).map((c) => {
            const on = filter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id as Filter)}
                style={{
                  height: 32,
                  padding: "0 14px",
                  border: 0,
                  background: on ? "var(--w6-ink)" : "transparent",
                  color: on ? "#fff" : "var(--w6-ink-2)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {c.l}
              </button>
            );
          })}
        </div>
        {cardOptions.length > 0 && (
          <select
            value={cardFilter}
            onChange={(e) => setCardFilter(e.target.value)}
            className="w6-input"
            style={{ width: "auto", height: 32, fontSize: 12.5 }}
          >
            <option value="all">All cards</option>
            {cardOptions.map((cp) => (
              <option key={cp} value={cp}>
                {shortPubkey(cp)}
              </option>
            ))}
          </select>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative", width: 280 }}>
          <span
            style={{
              position: "absolute",
              left: 10,
              top: 9,
              color: "var(--w6-ink-4)",
              fontSize: 13,
            }}
            aria-hidden="true"
          >
            ⌕
          </span>
          <input
            placeholder="merchant, hash, id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w6-input"
            style={{ paddingLeft: 30, height: 32, width: "100%" }}
          />
        </div>
      </div>

      {/* Table */}
      {error === "supabase_unconfigured" ? (
        <div
          className="w6-card"
          style={{ padding: 16, borderColor: "var(--w6-warn-cluster)" }}
        >
          Supabase not configured. Run the indexer to populate decisions.
        </div>
      ) : loading ? (
        <div
          className="w6-card-flat"
          style={{ padding: 60, textAlign: "center" }}
        >
          <div className="w6-muted" style={{ fontSize: 13 }}>
            Loading…
          </div>
        </div>
      ) : (
        <div className="w6-card-flat" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="w6-tbl">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Card</th>
                  <th>Merchant</th>
                  <th>Pact</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th>When</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const denied = r.decision !== "ALLOW";
                  return (
                    <tr key={r.id}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: `1px solid ${
                                denied ? "var(--w6-bad)" : "var(--w6-rule)"
                              }`,
                              background: denied
                                ? "rgba(179, 38, 30, 0.04)"
                                : "var(--w6-paper)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 700,
                              color: denied ? "var(--w6-bad)" : "var(--w6-ok)",
                            }}
                          >
                            {denied ? "✕" : "✓"}
                          </div>
                          <div>
                            <div
                              className="w6-mono"
                              style={{ fontSize: 12.5 }}
                            >
                              R-{String(r.id).padStart(6, "0")}
                            </div>
                            <div
                              className="w6-muted w6-mono"
                              style={{ fontSize: 11 }}
                            >
                              {r.sig_solscan
                                ? `${r.sig_solscan.slice(0, 8)}…`
                                : `slot ${r.slot}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className="w6-mono"
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid var(--w6-rule)",
                            background: "var(--w6-bg-2)",
                            fontSize: 11,
                            color: "var(--w6-ink-2)",
                          }}
                        >
                          {shortPubkey(r.card_pubkey)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>
                        {shortPubkey(r.merchant_pubkey)}
                      </td>
                      <td
                        className="w6-muted w6-mono"
                        style={{ fontSize: 11.5 }}
                      >
                        {r.pact_pubkey ? shortPubkey(r.pact_pubkey) : "—"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 13,
                        }}
                      >
                        ${lamportsToUsdc(r.amount_lamports)}
                      </td>
                      <td>
                        {denied ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "3px 9px",
                              borderRadius: 999,
                              background: "rgba(179, 38, 30, 0.08)",
                              color: "var(--w6-bad)",
                              fontSize: 11.5,
                              fontWeight: 500,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "var(--w6-bad)",
                              }}
                            />
                            denied
                            {r.deny_code != null && ` · ${r.deny_code}`}
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "3px 9px",
                              borderRadius: 999,
                              background: "rgba(22, 163, 74, 0.08)",
                              color: "var(--w6-ok)",
                              fontSize: 11.5,
                              fontWeight: 500,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "var(--w6-ok)",
                              }}
                            />
                            sealed
                          </span>
                        )}
                      </td>
                      <td className="w6-muted" style={{ fontSize: 12.5 }}>
                        {timeAgo(r.created_at)}
                      </td>
                      <td>
                        {r.sig_solscan && (
                          <a
                            href={getSolscanUrl(r.sig_solscan)}
                            target="_blank"
                            rel="noreferrer"
                            className="w6-muted"
                            style={{ fontSize: 14, textDecoration: "none" }}
                          >
                            ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div
              style={{ padding: 60, textAlign: "center" }}
              className="w6-muted"
            >
              {rows.length === 0 ? (
                <>
                  No activity yet. Hire an agent on{" "}
                  <Link
                    href="/agents"
                    style={{ color: "var(--w6-ink)", fontWeight: 500 }}
                  >
                    /agents
                  </Link>{" "}
                  to start.
                </>
              ) : (
                "No receipts match those filters."
              )}
            </div>
          )}
        </div>
      )}

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
