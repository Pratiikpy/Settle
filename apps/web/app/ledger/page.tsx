"use client";

/**
 * Wave 6 — Consumer · Receipts.
 *
 * Layout matches `setltlt protype/settle/screen-c-receipts.jsx` 1:1:
 *   - PageHeader (Receipts / Every payment, provable. / subtitle)
 *   - Search + filter chip row (All / Sends / Agent spends / Streaming
 *     / Escrow / Refunds / Denied / Public)
 *   - Single flat card-flat table with columns:
 *     Receipt · Kind · Counterparty · For · Amount · Confirmed · Status · When
 *
 * Real backend: `/api/ledger?wallet=…` returns 4 provenance buckets
 * (native_kernel / native_imported / federated_trusted / federated_
 * untrusted). We merge them into one flat list, sort by occurred_at,
 * and let users filter/search client-side. A small "include untrusted"
 * toggle next to the chip row surfaces the federated_untrusted bucket
 * — that's a real Settle feature the prototype missed; rendered in the
 * same chip style so it doesn't clash.
 *
 * Native (kernel-anchored) rows get a tiny `#` marker before the
 * receipt id — the rest are imported / federated. Hash-anchor signal
 * is real and meaningful.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { formatUsdc } from "@settle/sdk";
import { W6AppShell } from "../../components/w6-app-shell";

interface LedgerEntry {
  source:
    | "native_kernel"
    | "native_imported"
    | "federated_trusted"
    | "federated_untrusted";
  request_id: string;
  amount_lamports: string;
  asset: string;
  sender_pubkey: string | null;
  recipient_pubkey: string | null;
  occurred_at: string;
  receipt_kind?: string | null;
  decision?: string | null;
  import_source?: string | null;
  origin_id?: string | null;
}

interface LedgerResponse {
  ok: true;
  wallet: string;
  counts: {
    native_kernel: number;
    native_imported: number;
    federated_trusted: number;
    federated_untrusted: number;
  };
  native_kernel: LedgerEntry[];
  native_imported: LedgerEntry[];
  federated_trusted: LedgerEntry[];
  federated_untrusted: LedgerEntry[];
}

type Filter =
  | "all"
  | "direct_send"
  | "x402_spend"
  | "streaming_claim"
  | "escrow_release"
  | "refund"
  | "denied"
  | "public";

const CHIPS: Array<{ id: Filter; l: string }> = [
  { id: "all", l: "All" },
  { id: "direct_send", l: "Sends" },
  { id: "x402_spend", l: "Agent spends" },
  { id: "streaming_claim", l: "Streaming" },
  { id: "escrow_release", l: "Escrow" },
  { id: "refund", l: "Refunds" },
  { id: "denied", l: "Denied" },
  { id: "public", l: "Public" },
];

function shortPubkey(p: string | null): string {
  if (!p) return "—";
  return `${p.slice(0, 4)}…${p.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function LedgerPage() {
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const me = publicKey?.toBase58() ?? null;
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [includeUntrusted, setIncludeUntrusted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(
      `/api/ledger?wallet=${publicKey.toBase58()}&include_untrusted=${includeUntrusted}`,
    )
      .then(async (r) => {
        if (!r.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const j = (await r.json()) as LedgerResponse;
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, includeUntrusted]);

  // Merge all buckets into one sorted list.
  const allRows = useMemo(() => {
    if (!data) return [] as LedgerEntry[];
    const rows = [
      ...data.native_kernel,
      ...data.native_imported,
      ...data.federated_trusted,
      ...(includeUntrusted ? data.federated_untrusted : []),
    ];
    rows.sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );
    return rows;
  }, [data, includeUntrusted]);

  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      if (filter === "denied") {
        if (!r.decision) return false;
        const d = r.decision.toLowerCase();
        return d === "deny" || d === "denied" || d === "reject";
      }
      if (filter === "public") return false; // is_public flag not in /api/ledger output yet
      if (filter !== "all" && r.receipt_kind !== filter) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        r.request_id.toLowerCase().includes(s) ||
        (r.sender_pubkey ?? "").toLowerCase().includes(s) ||
        (r.recipient_pubkey ?? "").toLowerCase().includes(s) ||
        (r.origin_id ?? "").toLowerCase().includes(s) ||
        (r.import_source ?? "").toLowerCase().includes(s)
      );
    });
  }, [allRows, filter, q]);

  if (!connected) {
    return (
      <W6AppShell>
        <div style={{ maxWidth: 640, margin: "80px auto", textAlign: "center" }}>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, lineHeight: 1.05 }}
          >
            Connect a wallet to see your receipts.
          </h1>
          <p
            className="w6-muted"
            style={{ marginTop: 16, fontSize: 16, lineHeight: 1.5 }}
          >
            Self-custody. Every row below traces back to a signature you
            produced.
          </p>
        </div>
      </W6AppShell>
    );
  }

  return (
    <W6AppShell>
      {/* PageHeader */}
      <div style={{ marginBottom: 24 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Receipts
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
        >
          Every payment, provable.
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
          Filter by kind, search by anything. Click a row to see the
          forensic timeline.
        </p>
      </div>

      {/* Search + filter chips */}
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
            position: "relative",
            minWidth: 280,
            flex: 1,
            maxWidth: 420,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--w6-ink-4)",
              fontSize: 13,
            }}
            aria-hidden="true"
          >
            ⌕
          </span>
          <input
            placeholder="Search receipts, hashes, handles…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w6-input"
            style={{ paddingLeft: 36, width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CHIPS.map((c) => {
            const on = filter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id)}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: `1px solid ${on ? "var(--w6-ink)" : "var(--w6-rule)"}`,
                  background: on ? "var(--w6-ink)" : "#fff",
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
          <button
            type="button"
            onClick={() => setIncludeUntrusted((v) => !v)}
            title="Federated rows from origins the operator hasn't promoted yet"
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 999,
              border: `1px dashed var(--w6-rule)`,
              background: includeUntrusted
                ? "var(--w6-warn-cluster)"
                : "#fff",
              color: includeUntrusted ? "#fff" : "var(--w6-ink-4)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {includeUntrusted ? "✓ untrusted federated" : "+ untrusted federated"}
          </button>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div
          className="w6-card"
          style={{ padding: 24, borderColor: "var(--w6-bad)" }}
        >
          Couldn’t load your ledger right now. Try refreshing.
        </div>
      ) : loading && !data ? (
        <div className="w6-card-flat" style={{ padding: 60, textAlign: "center" }}>
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
                  <th>Kind</th>
                  <th>Counterparty</th>
                  <th>For</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Confirmed</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const denied =
                    r.decision &&
                    ["deny", "denied", "reject"].includes(
                      r.decision.toLowerCase(),
                    );
                  const counterparty =
                    r.sender_pubkey === me
                      ? r.recipient_pubkey
                      : r.sender_pubkey;
                  const sentByMe = r.sender_pubkey === me;
                  const isNative = r.source === "native_kernel";
                  const isImported = r.source === "native_imported";
                  const isFederatedUntrusted =
                    r.source === "federated_untrusted";
                  const usdc = formatUsdc(r.amount_lamports);
                  const linkable = isNative || isImported;
                  const href = linkable
                    ? `/r/${r.request_id}`
                    : null;
                  const kindLabel = (r.receipt_kind ?? "—").replace("_", " ");
                  const purpose = r.import_source
                    ? `via ${r.import_source}`
                    : r.origin_id
                      ? `origin ${r.origin_id}`
                      : "—";

                  const rowContent = (
                    <>
                      <td className="w6-mono" style={{ fontSize: 12 }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {isNative && (
                            <span
                              title="Kernel-anchored: 4-hash chain on Solana"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 16,
                                height: 16,
                                borderRadius: 4,
                                background: "var(--w6-ink)",
                                color: "#fff",
                                fontSize: 9,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              #
                            </span>
                          )}
                          {r.request_id.slice(0, 8).toUpperCase()}
                        </span>
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
                            fontSize: 10.5,
                            color: "var(--w6-ink-2)",
                          }}
                        >
                          {kindLabel}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {shortPubkey(counterparty)}
                      </td>
                      <td
                        className="w6-muted"
                        style={{ fontSize: 13, maxWidth: 280 }}
                      >
                        {purpose}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: 500,
                          fontVariantNumeric: "tabular-nums",
                          color: denied
                            ? "var(--w6-bad)"
                            : sentByMe
                              ? "var(--w6-ink)"
                              : "var(--w6-ok)",
                        }}
                      >
                        {denied ? "" : sentByMe ? "−" : "+"}${usdc}
                      </td>
                      <td
                        className="w6-mono"
                        style={{ fontSize: 11.5 }}
                      >
                        {isNative ? "anchored" : isImported ? "imported" : "—"}
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
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "3px 9px",
                              borderRadius: 999,
                              background: isFederatedUntrusted
                                ? "rgba(245, 158, 11, 0.08)"
                                : "rgba(22, 163, 74, 0.08)",
                              color: isFederatedUntrusted
                                ? "var(--w6-warn-cluster)"
                                : "var(--w6-ok)",
                              fontSize: 11.5,
                              fontWeight: 500,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: isFederatedUntrusted
                                  ? "var(--w6-warn-cluster)"
                                  : "var(--w6-ok)",
                              }}
                            />
                            {isFederatedUntrusted ? "untrusted" : "confirmed"}
                          </span>
                        )}
                      </td>
                      <td className="w6-muted" style={{ fontSize: 12 }}>
                        {timeAgo(r.occurred_at)}
                      </td>
                    </>
                  );

                  return href ? (
                    <tr
                      key={r.request_id}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        router.push(href);
                      }}
                    >
                      {rowContent}
                    </tr>
                  ) : (
                    <tr key={r.request_id}>{rowContent}</tr>
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
              {allRows.length === 0 ? (
                <>
                  No receipts yet.{" "}
                  <Link
                    href="/send"
                    style={{ color: "var(--w6-ink)", fontWeight: 500 }}
                  >
                    Send to anyone →
                  </Link>
                </>
              ) : (
                "No receipts match your filter."
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
