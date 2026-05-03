"use client";

/**
 * Wave 6 — Consumer · Pacts.
 *
 * Layout matches `setltlt protype/settle/screen-c-pacts.jsx` 1:1:
 *   - PageHeader (kicker / title / subtitle / "New Pact" CTA)
 *   - 3 mode-explainer cards (OneShot / Streaming / Delivery Escrow)
 *   - Filter chips (All / OneShot / Streaming / Escrow / Closed)
 *   - List: grouped-by-mode when "All", flat grid otherwise
 *   - Each PactCard shows status pill, mode pill, name, parent ref,
 *     spent/funded/claimed bar, and mode-specific subline.
 *
 * Real backend: `/api/cards/list` returns pacts from Supabase. Realtime
 * subscription on `pacts` table keeps state fresh (a paused stream
 * flips immediately, an escrow release lights up green, etc).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { W6AppShell } from "../../components/w6-app-shell";
import { supabaseBrowser } from "../../lib/supabase";
import { asAuthHeaders, fetchAuthHeaders } from "../../lib/client-auth";

type PactMode = "oneshot" | "streaming" | "delivery_escrow";

interface CardRow {
  card_pubkey: string;
  label: string;
  daily_cap_lamports: string | number;
  used_today: string | number;
  revoked: boolean;
  expiry_slot: string | number;
}

interface PactRow {
  pact_pubkey: string;
  parent_card: string;
  scope_label: string;
  mode: PactMode;
  cap_lamports: string | number | null;
  spent: string | number | null;
  rate_lamports_per_slot?: string | number | null;
  max_total_lamports?: string | number | null;
  claimed?: string | number | null;
  paused?: boolean | null;
  closed: boolean;
  escrow_amount?: string | number | null;
  escrow_merchant_pubkey?: string | null;
  confirm_deadline_slot?: string | null;
  dispute_deadline_slot?: string | null;
  released?: boolean | null;
  refunded?: boolean | null;
  expiry_slot: string | number;
}

type Filter = "all" | "oneshot" | "streaming" | "escrow" | "closed";

function lamportsToUsdc(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? BigInt(v) : BigInt(Math.round(Number(v)));
  return Number(n) / 1_000_000;
}

function formatUsdc(v: string | number | null | undefined): string {
  return lamportsToUsdc(v).toFixed(2);
}

const MODE_LABEL: Record<PactMode, string> = {
  oneshot: "OneShot",
  streaming: "Streaming",
  delivery_escrow: "Delivery escrow",
};

export default function CardsPage() {
  const { connected, publicKey, signMessage } = useWallet();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [pacts, setPacts] = useState<PactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [killedCardIds, setKilledCardIds] = useState<Set<string>>(new Set());
  const previousRevokedRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!connected || !publicKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let cardsChannel: RealtimeChannel | null = null;
    let pactsChannel: RealtimeChannel | null = null;

    async function loadAndSubscribe() {
      try {
        if (!signMessage) throw new Error("wallet does not support signMessage");
        const auth = await fetchAuthHeaders(publicKey!.toBase58(), signMessage);
        const r = await fetch(
          `/api/cards/list?authority=${publicKey!.toBase58()}`,
          { headers: asAuthHeaders(auth) },
        );
        const data = await r.json();
        if (cancelled) return;
        if (data.ok) {
          const incomingCards = (data.cards ?? []) as CardRow[];
          for (const c of incomingCards) {
            previousRevokedRef.current.set(c.card_pubkey, c.revoked);
          }
          setCards(incomingCards);
          setPacts(data.pacts ?? []);
          setAuthError(null);
        } else {
          setAuthError(data.error ?? "fetch_failed");
        }
      } catch (e) {
        if (!cancelled) setAuthError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }

      try {
        const supabase = supabaseBrowser();
        cardsChannel = supabase
          .channel(`cards:${publicKey!.toBase58()}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "agent_cards",
              filter: `authority_pubkey=eq.${publicKey!.toBase58()}`,
            },
            (payload) => {
              if (payload.eventType === "INSERT") {
                setCards((prev) => [payload.new as CardRow, ...prev]);
              } else if (payload.eventType === "UPDATE") {
                const newRow = payload.new as CardRow;
                const wasRevoked = previousRevokedRef.current.get(
                  newRow.card_pubkey,
                );
                if (wasRevoked === false && newRow.revoked) {
                  setPacts((currentPacts) => {
                    const frozenCount = currentPacts.filter(
                      (p) => p.parent_card === newRow.card_pubkey && !p.closed,
                    ).length;
                    toast.success(
                      frozenCount > 0
                        ? `${frozenCount} pact${frozenCount === 1 ? "" : "s"} frozen on-chain in <0.5 s — revoke confirmed.`
                        : `Card revoked on-chain in <0.5 s.`,
                    );
                    return currentPacts;
                  });
                  setKilledCardIds((prev) => {
                    const next = new Set(prev);
                    next.add(newRow.card_pubkey);
                    return next;
                  });
                  window.setTimeout(() => {
                    setKilledCardIds((prev) => {
                      const next = new Set(prev);
                      next.delete(newRow.card_pubkey);
                      return next;
                    });
                  }, 2_500);
                }
                previousRevokedRef.current.set(
                  newRow.card_pubkey,
                  newRow.revoked,
                );
                setCards((prev) =>
                  prev.map((c) =>
                    c.card_pubkey === newRow.card_pubkey ? newRow : c,
                  ),
                );
              } else if (payload.eventType === "DELETE") {
                setCards((prev) =>
                  prev.filter(
                    (c) => c.card_pubkey !== (payload.old as CardRow).card_pubkey,
                  ),
                );
              }
            },
          )
          .subscribe();

        pactsChannel = supabase
          .channel("pacts:any")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pacts" },
            (payload) => {
              const newRow = payload.new as PactRow | null;
              const oldRow = payload.old as PactRow | null;
              setCards((currentCards) => {
                const cardIds = new Set(
                  currentCards.map((c) => c.card_pubkey),
                );
                if (newRow && cardIds.has(newRow.parent_card)) {
                  setPacts((prev) => {
                    if (payload.eventType === "INSERT") return [newRow, ...prev];
                    if (payload.eventType === "UPDATE") {
                      return prev.map((p) =>
                        p.pact_pubkey === newRow.pact_pubkey ? newRow : p,
                      );
                    }
                    return prev;
                  });
                }
                if (payload.eventType === "DELETE" && oldRow) {
                  setPacts((prev) =>
                    prev.filter((p) => p.pact_pubkey !== oldRow.pact_pubkey),
                  );
                }
                return currentCards;
              });
            },
          )
          .subscribe();
      } catch {
        /* Supabase unconfigured. */
      }
    }

    void loadAndSubscribe();

    return () => {
      cancelled = true;
      if (cardsChannel) void cardsChannel.unsubscribe();
      if (pactsChannel) void pactsChannel.unsubscribe();
    };
  }, [connected, publicKey, signMessage]);

  const visiblePacts = pacts.filter((p) => {
    if (filter === "all") return !p.closed;
    if (filter === "closed") return p.closed;
    if (filter === "escrow") return p.mode === "delivery_escrow" && !p.closed;
    return p.mode === filter && !p.closed;
  });

  return (
    <W6AppShell>
      {/* PageHeader */}
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
            Pacts
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Task-scoped vaults.
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
            A Pact is a budget bound to a card, an agent, or a delivery
            deadline. Three modes — fund, watch the rules, close cleanly.
          </p>
        </div>
        <Link href="/cards/new" className="w6-btn w6-btn-primary w6-btn-sm">
          + New Pact
        </Link>
      </div>

      {/* Mode explainers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 28,
        }}
        className="w6-pacts-modes"
      >
        <ModeExplainer
          name="OneShot"
          desc="Fixed budget for a fixed task. Closing returns unspent USDC."
          href="/cards/new?mode=oneshot"
        />
        <ModeExplainer
          name="Streaming"
          desc="Money accrues per slot up to a max. Pause / resume / prorata refund."
          href="/cards/new?mode=streaming"
        />
        <ModeExplainer
          name="Delivery escrow"
          desc="Buyer pre-funds. Releases on confirm or after deadline."
          href="/cards/new?mode=delivery_escrow"
        />
      </div>

      {/* Filter chips */}
      <div
        style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}
      >
        {(
          [
            { id: "all", l: "All" },
            { id: "oneshot", l: "OneShot" },
            { id: "streaming", l: "Streaming" },
            { id: "escrow", l: "Escrow" },
            { id: "closed", l: "Closed" },
          ] as const
        ).map((c) => {
          const on = filter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id as Filter)}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 999,
                border: `1px solid ${on ? "var(--w6-ink)" : "var(--w6-rule)"}`,
                background: on ? "var(--w6-ink)" : "#fff",
                color: on ? "#fff" : "var(--w6-ink-2)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {c.l}
            </button>
          );
        })}
      </div>

      {authError && (
        <div
          className="w6-card"
          style={{
            padding: 16,
            marginBottom: 24,
            borderColor: "var(--w6-bad)",
          }}
        >
          Couldn’t load your Pacts: {authError}
        </div>
      )}

      {!connected ? (
        <div className="w6-card" style={{ padding: 32, textAlign: "center" }}>
          <p className="w6-muted" style={{ fontSize: 14 }}>
            Connect a wallet to see your Pacts.
          </p>
        </div>
      ) : loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 14,
          }}
          className="w6-pacts-grid"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="w6-card animate-pulse"
              style={{ height: 200 }}
            />
          ))}
        </div>
      ) : visiblePacts.length === 0 ? (
        <div className="w6-card" style={{ padding: 40, textAlign: "center" }}>
          <div className="w6-heading" style={{ fontSize: 20, marginBottom: 8 }}>
            {filter === "all"
              ? "No active spending rules yet"
              : `No ${filter === "closed" ? "closed" : filter} spending rules`}
          </div>
          <p
            className="w6-muted"
            style={{
              fontSize: 13,
              marginBottom: 16,
              maxWidth: 480,
              margin: "0 auto 16px",
            }}
          >
            Open one to bound an agent&rsquo;s spend, stream payments to a
            collaborator, or pre-fund a delivery — Settle holds the funds
            until the rules say release.
          </p>
          <Link href="/cards/new" className="w6-btn w6-btn-primary w6-btn-sm">
            Open a Pact →
          </Link>
        </div>
      ) : filter === "all" ? (
        (["oneshot", "streaming", "delivery_escrow"] as PactMode[]).map((g) => {
          const items = visiblePacts.filter((p) => p.mode === g);
          if (items.length === 0) return null;
          return (
            <div key={g} style={{ marginBottom: 28 }}>
              <div
                className="w6-eyebrow"
                style={{ marginBottom: 10, fontSize: 11.5 }}
              >
                {g.replace("_", " ")}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 14,
                }}
                className="w6-pacts-grid"
              >
                {items.map((p) => (
                  <PactCard
                    key={p.pact_pubkey}
                    p={p}
                    cards={cards}
                    killed={killedCardIds.has(p.parent_card)}
                  />
                ))}
              </div>
            </div>
          );
        })
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 14,
          }}
          className="w6-pacts-grid"
        >
          {visiblePacts.map((p) => (
            <PactCard
              key={p.pact_pubkey}
              p={p}
              cards={cards}
              killed={killedCardIds.has(p.parent_card)}
            />
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 880px) {
          .w6-pacts-modes,
          .w6-pacts-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 560px) {
          .w6-pacts-modes,
          .w6-pacts-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </W6AppShell>
  );
}

/* ============================================================ */

function ModeExplainer({
  name,
  desc,
  href,
}: {
  name: string;
  desc: string;
  href: string;
}) {
  return (
    <div className="w6-card" style={{ padding: 22 }}>
      <div className="w6-heading" style={{ fontSize: 18, marginBottom: 10 }}>
        {name}
      </div>
      <div
        className="w6-muted"
        style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}
      >
        {desc}
      </div>
      <Link href={href} className="w6-btn w6-btn-secondary w6-btn-sm">
        Open {name}
      </Link>
    </div>
  );
}

function PactCard({
  p,
  cards,
  killed,
}: {
  p: PactRow;
  cards: CardRow[];
  killed: boolean;
}) {
  const parentCard = cards.find((c) => c.card_pubkey === p.parent_card);
  const parentLabel = parentCard?.label ?? p.parent_card.slice(0, 6) + "…";

  const pct = (() => {
    if (p.mode === "streaming") {
      const claimed = lamportsToUsdc(p.claimed);
      const max = lamportsToUsdc(p.max_total_lamports);
      return max > 0 ? Math.min(100, (claimed / max) * 100) : 0;
    }
    if (p.mode === "delivery_escrow") {
      return p.released ? 100 : p.refunded ? 100 : 0;
    }
    const spent = lamportsToUsdc(p.spent);
    const cap = lamportsToUsdc(p.cap_lamports);
    return cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  })();

  const stateLabel = p.closed
    ? "closed"
    : p.released
      ? "released"
      : p.refunded
        ? "refunded"
        : p.paused
          ? "paused"
          : "active";
  const stateDot =
    stateLabel === "active"
      ? "var(--w6-ok)"
      : stateLabel === "paused"
        ? "var(--w6-warn-cluster)"
        : stateLabel === "released"
          ? "var(--w6-ink)"
          : "var(--w6-ink-5)";

  const numeratorLabel =
    p.mode === "streaming"
      ? "claimed"
      : p.mode === "delivery_escrow"
        ? "funded"
        : "spent";
  const numerator =
    p.mode === "streaming"
      ? formatUsdc(p.claimed)
      : p.mode === "delivery_escrow"
        ? formatUsdc(p.escrow_amount ?? p.cap_lamports)
        : formatUsdc(p.spent);
  const denominator =
    p.mode === "streaming"
      ? formatUsdc(p.max_total_lamports)
      : p.mode === "delivery_escrow"
        ? formatUsdc(p.escrow_amount ?? p.cap_lamports)
        : formatUsdc(p.cap_lamports);

  return (
    <motion.div
      animate={
        killed
          ? {
              scale: [1, 0.99, 0.95],
              opacity: [1, 0.7, 0.35],
              filter: ["saturate(1)", "saturate(0.6)", "saturate(0.2)"],
            }
          : { scale: 1, opacity: 1, filter: "saturate(1)" }
      }
      transition={{
        duration: 0.85,
        times: [0, 0.4, 1],
        ease: "easeOut",
        delay: killed ? Math.random() * 0.25 : 0,
      }}
      style={{ position: "relative" }}
    >
      <Link
        href={`/cards/${p.pact_pubkey}`}
        className="w6-card w6-card-hover"
        style={{
          padding: 20,
          display: "block",
          textDecoration: "none",
          color: "var(--w6-ink)",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 10,
            alignItems: "center",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 9px",
              borderRadius: 999,
              border: "1px solid var(--w6-rule)",
              background: "#fff",
              fontSize: 11.5,
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: stateDot,
              }}
            />
            {stateLabel}
          </span>
          <span
            className="w6-mono"
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid var(--w6-rule)",
              background: "var(--w6-bg-2)",
              fontSize: 10.5,
              fontWeight: 500,
              color: "var(--w6-ink-2)",
            }}
          >
            {MODE_LABEL[p.mode]}
          </span>
        </div>

        <div className="w6-heading" style={{ fontSize: 18, marginBottom: 4 }}>
          {p.scope_label}
        </div>

        <div className="w6-muted" style={{ fontSize: 12, marginBottom: 14 }}>
          {p.mode === "delivery_escrow" && p.escrow_merchant_pubkey
            ? `merchant ${p.escrow_merchant_pubkey.slice(0, 4)}…${p.escrow_merchant_pubkey.slice(-4)}`
            : `card ${parentLabel}`}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span className="w6-micro" style={{ fontSize: 11 }}>
            {numeratorLabel}
          </span>
          <span className="w6-mono" style={{ fontSize: 12 }}>
            ${numerator}
            <span className="w6-muted"> / ${denominator}</span>
          </span>
        </div>

        <div
          style={{
            height: 6,
            background: "var(--w6-rule-2)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--w6-ink)",
            }}
          />
        </div>

        <div className="w6-muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          {p.mode === "streaming" ? (
            <>
              ${formatUsdc(p.rate_lamports_per_slot)} / slot
              {" · "}
              {p.paused ? "paused" : "live"}
            </>
          ) : p.mode === "delivery_escrow" ? (
            p.confirm_deadline_slot ? (
              <>
                confirm by slot{" "}
                {Number(p.confirm_deadline_slot).toLocaleString()}
              </>
            ) : (
              <>open</>
            )
          ) : (
            <>expires slot {Number(p.expiry_slot).toLocaleString()}</>
          )}
        </div>
      </Link>

      <AnimatePresence>
        {killed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.5 }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "2px solid rgba(239, 68, 68, 0.6)",
                background: "rgba(239, 68, 68, 0.05)",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "rgb(239, 68, 68)",
              }}
            >
              frozen
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
