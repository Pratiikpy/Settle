"use client";

/**
 * Wave 6 — Notifications inbox.
 *
 * Layout matches `setltlt protype/settle/screen-notifications.jsx` 1:1:
 *   - Header (Notifications / "Denials, cap warnings, and confirmations." /
 *     "Mark all read")
 *   - Grid 2: list (380px, sticky) + detail
 *   - List items: unread dot · kind pill · title · body · ts
 *   - Detail: kind pill + ts + title + body + linked receipt (if any)
 *
 * Real backend: derives notifications from existing `policy_decisions`
 * rows. `decision === 'DENY'` → "denied" inbox item; `deny_code` carries
 * the rule that fired. Realtime subscription on the same table keeps
 * the inbox live. No fake notifications generated.
 *
 * Read-state is local (in-browser) since we don't have a per-user
 * notification table yet — the "unread" dot resets on reload. Persisting
 * read state cleanly is a follow-up that would need a `notifications` or
 * `notification_reads` table.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { W6AppShell } from "../../components/w6-app-shell";
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

interface Notif {
  id: string;
  kind: "denied" | "cap" | "info";
  title: string;
  body: string;
  ts: string;
  decision: DecisionRow;
  read: boolean;
}

const DENY_REASONS: Record<number, string> = {
  1: "daily cap exceeded",
  2: "per-call cap exceeded",
  3: "merchant not on allowlist",
  4: "card revoked",
  5: "card expired",
  6: "capability mismatch",
  7: "policy version stale",
};

function decisionToNotif(d: DecisionRow): Notif | null {
  if (d.decision === "ALLOW") return null;
  const denyText = d.deny_code != null ? DENY_REASONS[d.deny_code] : null;
  const merchantShort = d.merchant_pubkey
    ? `${d.merchant_pubkey.slice(0, 4)}…${d.merchant_pubkey.slice(-4)}`
    : "unknown merchant";
  const cardShort = `${d.card_pubkey.slice(0, 4)}…${d.card_pubkey.slice(-4)}`;
  const usdc = lamportsToUsdc(d.amount_lamports);
  return {
    id: String(d.id),
    kind: "denied",
    title: `Denied · $${usdc} → ${merchantShort}`,
    body: denyText
      ? `Card ${cardShort} blocked the spend: ${denyText}.`
      : `Card ${cardShort} blocked this spend by policy. Reason code ${d.deny_code ?? "—"}.`,
    ts: timeAgo(d.created_at),
    decision: d,
    read: false,
  };
}

export default function NotificationsPage() {
  const { connected } = useWallet();
  const [items, setItems] = useState<Notif[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    (async () => {
      try {
        const res = await fetch("/api/feed?limit=50");
        const j = await res.json();
        if (cancelled) return;
        if (res.ok) {
          const decisions = (j.events ?? []) as DecisionRow[];
          const notifs = decisions
            .map(decisionToNotif)
            .filter((n): n is Notif => n !== null);
          setItems(notifs);
          if (notifs[0]) setSelected(notifs[0].id);
          setError(null);
        } else {
          setError(j.error ?? "fetch_failed");
        }
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
      try {
        const supabase = supabaseBrowser();
        channel = supabase
          .channel("notifications:public")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "policy_decisions" },
            (payload) => {
              const d = payload.new as DecisionRow;
              const n = decisionToNotif(d);
              if (n) setItems((prev) => [n, ...prev].slice(0, 100));
            },
          )
          .subscribe();
      } catch {
        /* unconfigured supabase already shown */
      }
    })();
    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, []);

  const sel = items.find((i) => i.id === selected) ?? null;
  const unreadCount = useMemo(
    () => items.filter((n) => !readIds.has(n.id)).length,
    [items, readIds],
  );

  function markRead(id: string) {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }
  function markAll() {
    setReadIds(new Set(items.map((n) => n.id)));
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
            Notifications
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            What needs your attention.
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
            Denials, cap warnings, and group-vote requests. Streamed live
            from <code>policy_decisions</code> · everything you see here is
            real on-chain activity.
          </p>
        </div>
        <button
          type="button"
          onClick={markAll}
          disabled={unreadCount === 0}
          className="w6-btn w6-btn-secondary w6-btn-sm"
        >
          Mark all read
        </button>
      </div>

      {!connected ? (
        <div className="w6-card" style={{ padding: 32, textAlign: "center" }}>
          <p className="w6-muted" style={{ fontSize: 14 }}>
            Connect a wallet to see your notifications.
          </p>
        </div>
      ) : error ? (
        <div
          className="w6-card"
          style={{ padding: 16, borderColor: "var(--w6-bad)" }}
        >
          Couldn’t load notifications: {error}
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
      ) : items.length === 0 ? (
        <div className="w6-card" style={{ padding: 40, textAlign: "center" }}>
          <div className="w6-heading" style={{ fontSize: 20, marginBottom: 8 }}>
            All clear
          </div>
          <p className="w6-muted" style={{ fontSize: 13 }}>
            No denials or cap warnings yet. When an agent attempts a spend
            outside your rules, it&rsquo;ll show up here in real time.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "380px minmax(0, 1fr)",
            gap: 0,
            border: "1px solid var(--w6-rule)",
            borderRadius: 16,
            overflow: "hidden",
            background: "var(--w6-bg)",
          }}
          className="w6-notifs-grid"
        >
          {/* List */}
          <div
            style={{
              borderRight: "1px solid var(--w6-rule)",
              maxHeight: "70vh",
              overflowY: "auto",
            }}
            className="w6-notifs-list"
          >
            {items.map((n) => {
              const isRead = readIds.has(n.id);
              const isSel = selected === n.id;
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    setSelected(n.id);
                    markRead(n.id);
                  }}
                  style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--w6-rule-2)",
                    cursor: "pointer",
                    background: isSel ? "var(--w6-bg-2)" : "transparent",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: isRead ? "transparent" : "var(--w6-ink)",
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <KindPill kind={n.kind} />
                      <div style={{ flex: 1 }} />
                      <span
                        className="w6-muted"
                        style={{ fontSize: 11 }}
                      >
                        {n.ts}
                      </span>
                    </div>
                    <div
                      style={{
                        fontWeight: isRead ? 500 : 600,
                        fontSize: 13.5,
                        marginBottom: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.title}
                    </div>
                    <div
                      className="w6-muted"
                      style={{
                        fontSize: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail */}
          <div style={{ padding: 32 }} className="w6-notifs-detail">
            {!sel ? (
              <div className="w6-muted" style={{ fontSize: 13 }}>
                Select a notification.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <KindPill kind={sel.kind} large />
                  <span
                    className="w6-muted"
                    style={{ fontSize: 12.5 }}
                  >
                    {sel.ts}
                  </span>
                </div>
                <div
                  className="w6-heading"
                  style={{
                    fontSize: 32,
                    lineHeight: 1.05,
                    marginBottom: 12,
                    maxWidth: 600,
                  }}
                >
                  {sel.title}
                </div>
                <p
                  style={{
                    fontSize: 14.5,
                    color: "var(--w6-ink-2)",
                    maxWidth: 600,
                    marginBottom: 24,
                    lineHeight: 1.55,
                  }}
                >
                  {sel.body}
                </p>

                <div
                  className="w6-card-flat"
                  style={{ padding: 18, maxWidth: 480, marginBottom: 18 }}
                >
                  <div className="w6-eyebrow" style={{ marginBottom: 8 }}>
                    Decision detail
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <SummaryRow
                      k="Card"
                      v={`${sel.decision.card_pubkey.slice(0, 6)}…${sel.decision.card_pubkey.slice(-4)}`}
                    />
                    {sel.decision.pact_pubkey && (
                      <SummaryRow
                        k="Pact"
                        v={`${sel.decision.pact_pubkey.slice(0, 6)}…${sel.decision.pact_pubkey.slice(-4)}`}
                      />
                    )}
                    <SummaryRow
                      k="Amount"
                      v={`$${lamportsToUsdc(sel.decision.amount_lamports)}`}
                    />
                    <SummaryRow k="Slot" v={String(sel.decision.slot)} />
                    {sel.decision.deny_code != null && (
                      <SummaryRow
                        k="Deny code"
                        v={String(sel.decision.deny_code)}
                      />
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link
                    href={`/audit?card=${sel.decision.card_pubkey}`}
                    className="w6-btn w6-btn-secondary w6-btn-sm"
                  >
                    See card decisions
                  </Link>
                  {sel.decision.sig_solscan && (
                    <a
                      href={getSolscanUrl(sel.decision.sig_solscan)}
                      target="_blank"
                      rel="noreferrer"
                      className="w6-btn w6-btn-secondary w6-btn-sm"
                    >
                      Solscan ↗
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 880px) {
          .w6-notifs-grid { grid-template-columns: 1fr !important; }
          .w6-notifs-list { border-right: 0 !important; border-bottom: 1px solid var(--w6-rule); max-height: 50vh; }
          .w6-notifs-detail { padding: 20px !important; }
        }
      `}</style>
    </W6AppShell>
  );
}

/* ============================================================ */

function KindPill({
  kind,
  large,
}: {
  kind: Notif["kind"];
  large?: boolean;
}) {
  const { bg, color, label } =
    kind === "denied"
      ? {
          bg: "rgba(179, 38, 30, 0.08)",
          color: "var(--w6-bad)",
          label: "denied",
        }
      : kind === "cap"
        ? {
            bg: "rgba(245, 158, 11, 0.1)",
            color: "var(--w6-warn-cluster)",
            label: "cap",
          }
        : {
            bg: "var(--w6-bg-2)",
            color: "var(--w6-ink-3)",
            label: "info",
          };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: large ? "4px 12px" : "2px 8px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: large ? 12 : 10.5,
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 8,
        padding: "4px 0",
      }}
    >
      <span className="w6-micro" style={{ fontSize: 11.5 }}>
        {k}
      </span>
      <span className="w6-mono" style={{ fontSize: 12 }}>
        {v}
      </span>
    </div>
  );
}
