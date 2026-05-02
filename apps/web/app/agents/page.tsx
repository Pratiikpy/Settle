"use client";

/**
 * Wave 6 — Agent surface · list view.
 *
 * Layout matches `setltlt protype/settle/screen-agents.jsx` 1:1:
 *   - Header (eyebrow / title / subtitle / Templates + "+ New agent" CTAs)
 *   - Grid 2: agent-cards table (left) + detail panel (right, sticky)
 *   - Table cols: Agent · Status · Spent · Cap usage · Pacts · Expires
 *   - Detail: avatar + name + agent pubkey + Open btn, mini-stat grid,
 *     card pubkey, active policy rules, actions
 *
 * Real backend: `/api/cards/list?authority=<pubkey>` returns the
 * authority's `agent_cards` rows + their child Pacts. One card == one
 * agent delegation; spent24h == `used_today`, cap_daily ==
 * `daily_cap_lamports`, status derives from `revoked`.
 *
 * The hire-form lives at `/agents/new`. "+ New agent" links there.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { W6AppShell } from "../../components/w6-app-shell";
import { asAuthHeaders, fetchAuthHeaders } from "../../lib/client-auth";

interface CardRow {
  card_pubkey: string;
  authority_pubkey: string;
  agent_pubkey: string;
  label: string;
  daily_cap_lamports: string | number;
  per_call_max_lamports: string | number;
  used_today: string | number;
  revoked: boolean;
  expiry_slot: string | number;
  policy_version?: number;
  created_at?: string;
}

interface PactRow {
  pact_pubkey: string;
  parent_card: string;
  scope_label: string;
  closed: boolean;
}

function lamportsToUsdcNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? BigInt(v) : BigInt(Math.round(Number(v)));
  return Number(n) / 1_000_000;
}

function formatUsdc(v: string | number | null | undefined): string {
  return lamportsToUsdcNum(v).toFixed(2);
}

function avatarInitial(label: string): string {
  return (label.replace(/[^A-Za-z0-9]/g, "")[0] ?? "?").toUpperCase();
}

function statusOf(c: CardRow): "active" | "revoked" {
  return c.revoked ? "revoked" : "active";
}

export default function AgentsPage() {
  const { connected, publicKey, signMessage } = useWallet();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [pacts, setPacts] = useState<PactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!signMessage) throw new Error("wallet does not support signMessage");
        const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
        const r = await fetch(
          `/api/cards/list?authority=${publicKey.toBase58()}`,
          { headers: asAuthHeaders(auth) },
        );
        const data = await r.json();
        if (cancelled) return;
        if (data.ok) {
          const incomingCards = (data.cards ?? []) as CardRow[];
          setCards(incomingCards);
          setPacts((data.pacts ?? []) as PactRow[]);
          if (incomingCards.length > 0) {
            setSelected(incomingCards[0]!.card_pubkey);
          }
          setAuthError(null);
        } else {
          setAuthError(data.error ?? "fetch_failed");
        }
      } catch (e) {
        if (!cancelled) setAuthError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, signMessage]);

  const selectedCard = useMemo(
    () => cards.find((c) => c.card_pubkey === selected) ?? null,
    [cards, selected],
  );
  const selectedPactCount = useMemo(
    () =>
      selectedCard
        ? pacts.filter(
            (p) => p.parent_card === selectedCard.card_pubkey && !p.closed,
          ).length
        : 0,
    [pacts, selectedCard],
  );

  return (
    <W6AppShell forceSurface="agent">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 24,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Agents · principal view
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Programmable spend, supervised.
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
            Cards delegate budget to agents; Pacts task-scope it; receipts
            prove every decision. You can revoke any card immediately.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/agents/templates"
            className="w6-btn w6-btn-secondary w6-btn-sm"
          >
            Templates
          </Link>
          <Link href="/agents/new" className="w6-btn w6-btn-primary w6-btn-sm">
            + New agent
          </Link>
        </div>
      </div>

      {!connected ? (
        <div className="w6-card" style={{ padding: 32, textAlign: "center" }}>
          <p className="w6-muted" style={{ fontSize: 14 }}>
            Connect a wallet to see your agents.
          </p>
        </div>
      ) : authError ? (
        <div
          className="w6-card"
          style={{
            padding: 16,
            marginBottom: 24,
            borderColor: "var(--w6-bad)",
          }}
        >
          Couldn’t load your agents: {authError}
        </div>
      ) : loading ? (
        <div className="w6-card-flat" style={{ padding: 60, textAlign: "center" }}>
          <div className="w6-muted" style={{ fontSize: 13 }}>
            Loading…
          </div>
        </div>
      ) : cards.length === 0 ? (
        <div className="w6-card" style={{ padding: 40, textAlign: "center" }}>
          <div className="w6-heading" style={{ fontSize: 22, marginBottom: 8 }}>
            No agents yet
          </div>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginBottom: 16,
              maxWidth: 480,
              margin: "0 auto 16px",
              lineHeight: 1.5,
            }}
          >
            AgentCards turn AI workflows into bounded spend. Hire your
            first one and watch it work — within the rules you set, not a
            cent outside.
          </p>
          <Link href="/agents/new" className="w6-btn w6-btn-primary w6-btn-sm">
            Hire your first agent →
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 420px",
            gap: 0,
          }}
          className="w6-agents-grid"
        >
          {/* List */}
          <div style={{ paddingRight: 24 }} className="w6-agents-list">
            <div className="w6-card-flat" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="w6-tbl">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Spent · 24h</th>
                      <th style={{ width: 140 }}>Cap usage</th>
                      <th style={{ textAlign: "right" }}>Pacts</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((c) => {
                      const cap = lamportsToUsdcNum(c.daily_cap_lamports);
                      const used = lamportsToUsdcNum(c.used_today);
                      const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
                      const status = statusOf(c);
                      const cardPactCount = pacts.filter(
                        (p) => p.parent_card === c.card_pubkey && !p.closed,
                      ).length;
                      const isSel = selected === c.card_pubkey;
                      return (
                        <tr
                          key={c.card_pubkey}
                          onClick={() => setSelected(c.card_pubkey)}
                          style={{
                            cursor: "pointer",
                            background: isSel ? "var(--w6-bg-2)" : "transparent",
                          }}
                        >
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
                                  width: 32,
                                  height: 32,
                                  borderRadius: "50%",
                                  background: "var(--w6-ink)",
                                  color: "#fff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 13,
                                  fontWeight: 600,
                                  flexShrink: 0,
                                }}
                              >
                                {avatarInitial(c.label)}
                              </div>
                              <div>
                                <div
                                  style={{ fontWeight: 600, fontSize: 13.5 }}
                                >
                                  {c.label}
                                </div>
                                <div
                                  className="w6-muted w6-mono"
                                  style={{ fontSize: 11.5 }}
                                >
                                  {c.agent_pubkey.slice(0, 6)}…
                                  {c.agent_pubkey.slice(-4)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <StatusPill status={status} />
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                              fontSize: 13,
                            }}
                          >
                            ${formatUsdc(c.used_today)}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  height: 4,
                                  background: "var(--w6-rule)",
                                  borderRadius: 2,
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: "100%",
                                    background:
                                      pct > 80
                                        ? "var(--w6-warn-cluster)"
                                        : "var(--w6-ink)",
                                    borderRadius: 2,
                                  }}
                                />
                              </div>
                              <span
                                className="w6-mono"
                                style={{
                                  fontSize: 11,
                                  color: "var(--w6-ink-3)",
                                  minWidth: 32,
                                  textAlign: "right",
                                }}
                              >
                                {Math.round(pct)}%
                              </span>
                            </div>
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              fontSize: 13,
                            }}
                          >
                            {cardPactCount}
                          </td>
                          <td
                            className="w6-muted"
                            style={{ fontSize: 12.5 }}
                          >
                            slot {Number(c.expiry_slot).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Detail */}
          <aside
            className="w6-agent-detail"
            style={{
              borderLeft: "1px solid var(--w6-rule)",
              padding: "0 0 32px 24px",
              background: "var(--w6-bg)",
            }}
          >
            {selectedCard ? (
              <AgentDetail
                card={selectedCard}
                pactCount={selectedPactCount}
              />
            ) : (
              <div className="w6-muted" style={{ padding: 24 }}>
                Select a row to see details.
              </div>
            )}
          </aside>
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
        @media (max-width: 980px) {
          .w6-agents-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .w6-agents-list { padding-right: 0 !important; }
          .w6-agent-detail { border-left: 0 !important; padding-left: 0 !important; }
        }
      `}</style>
    </W6AppShell>
  );
}

/* ============================================================ */

function StatusPill({
  status,
}: {
  status: "active" | "revoked";
}) {
  const isOk = status === "active";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: 999,
        background: isOk
          ? "rgba(22, 163, 74, 0.08)"
          : "rgba(179, 38, 30, 0.08)",
        color: isOk ? "var(--w6-ok)" : "var(--w6-bad)",
        fontSize: 11.5,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isOk ? "var(--w6-ok)" : "var(--w6-bad)",
        }}
      />
      {status}
    </span>
  );
}

function AgentDetail({
  card,
  pactCount,
}: {
  card: CardRow;
  pactCount: number;
}) {
  const cap = lamportsToUsdcNum(card.daily_cap_lamports);
  const perCall = lamportsToUsdcNum(card.per_call_max_lamports);
  const used = lamportsToUsdcNum(card.used_today);

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--w6-ink)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {avatarInitial(card.label)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="w6-heading" style={{ fontSize: 22, lineHeight: 1.1 }}>
            {card.label}
          </div>
          <div className="w6-muted w6-mono" style={{ fontSize: 11.5 }}>
            {card.agent_pubkey.slice(0, 8)}…{card.agent_pubkey.slice(-6)}
          </div>
        </div>
        <Link
          href={`/cards/${card.card_pubkey}?surface=agent`}
          className="w6-btn w6-btn-secondary w6-btn-sm"
        >
          Open
        </Link>
      </div>

      {/* Mini-stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <MiniStat label="Spent · today" value={`$${used.toFixed(2)} USDC`} />
        <MiniStat label="Daily cap" value={`$${cap.toFixed(2)} USDC`} />
        <MiniStat label="Per-call max" value={`$${perCall.toFixed(2)}`} />
        <MiniStat label="Open Pacts" value={String(pactCount)} />
      </div>

      {/* Card pubkey */}
      <div className="w6-micro" style={{ marginBottom: 8 }}>
        Card pubkey
      </div>
      <code
        className="w6-mono"
        style={{
          display: "block",
          padding: "8px 10px",
          background: "var(--w6-bg-2)",
          border: "1px solid var(--w6-rule)",
          borderRadius: 7,
          fontSize: 11.5,
          wordBreak: "break-all",
          color: "var(--w6-ink-2)",
          marginBottom: 18,
        }}
      >
        {card.card_pubkey}
      </code>

      {/* Active policies */}
      <div className="w6-micro" style={{ marginBottom: 8 }}>
        Active policies
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 18,
        }}
      >
        <PolicyRow text={`caps.daily ≤ $${cap.toFixed(2)} USDC`} />
        <PolicyRow text={`caps.single ≤ $${perCall.toFixed(2)} USDC`} />
        <PolicyRow
          text={`expiry ≤ slot ${Number(card.expiry_slot).toLocaleString()}`}
        />
        {card.revoked && <PolicyRow text="status = revoked" tone="bad" />}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Link
          href={`/cards/${card.card_pubkey}?tab=policy&surface=agent`}
          className="w6-btn w6-btn-secondary w6-btn-sm"
          style={{ width: "100%", justifyContent: "center" }}
        >
          Edit caps & allowlist
        </Link>
        <Link
          href={`/audit?card=${card.card_pubkey}`}
          className="w6-btn w6-btn-secondary w6-btn-sm"
          style={{ width: "100%", justifyContent: "center" }}
        >
          See live decisions
        </Link>
        <Link
          href={`/blink/research?card=${card.card_pubkey}`}
          className="w6-btn w6-btn-secondary w6-btn-sm"
          style={{ width: "100%", justifyContent: "center" }}
        >
          Share via Blink
        </Link>
        {!card.revoked && (
          <Link
            href={`/cards/${card.card_pubkey}?revoke=1&surface=agent`}
            className="w6-btn w6-btn-secondary w6-btn-sm"
            style={{
              width: "100%",
              justifyContent: "center",
              borderColor: "var(--w6-bad)",
              color: "var(--w6-bad)",
            }}
          >
            Revoke this card
          </Link>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "var(--w6-bg-2)",
      }}
    >
      <div className="w6-micro">{label}</div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PolicyRow({ text, tone }: { text: string; tone?: "bad" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background:
          tone === "bad" ? "rgba(179, 38, 30, 0.06)" : "var(--w6-bg-2)",
        borderRadius: 7,
        fontSize: 12.5,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: tone === "bad" ? "var(--w6-bad)" : "var(--w6-ok)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {tone === "bad" ? "!" : "✓"}
      </span>
      <span className="w6-mono" style={{ fontSize: 12 }}>
        {text}
      </span>
    </div>
  );
}
