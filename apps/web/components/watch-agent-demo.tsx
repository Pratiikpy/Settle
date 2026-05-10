"use client";

import { useEffect, useMemo, useState } from "react";
import { getSolscanUrl } from "../lib/solana";

/**
 * /watch agent-attack demo.
 *
 * Polls /api/landing/feed every 4s for the latest real receipts and
 * renders them as a cinematic ledger. When the feed is in preview mode
 * (no real receipts), we still loop a clearly-labelled scenario so the
 * page is never blank — but we never lie about it.
 */

interface FeedItem {
  request_id: string;
  decision: "ALLOW" | "DENY";
  deny_code: string | null;
  amount_usdc: number;
  merchant: string | null;
  sig: string | null;
  receipt_hash: string | null;
  created_at: string;
}

const PREVIEW: FeedItem[] = [
  {
    request_id: "preview-1",
    decision: "ALLOW",
    deny_code: null,
    amount_usdc: 0.99,
    merchant: "ResearchBot",
    sig: null,
    receipt_hash: "ax01",
    created_at: new Date().toISOString(),
  },
  {
    request_id: "preview-2",
    decision: "ALLOW",
    deny_code: null,
    amount_usdc: 4.5,
    merchant: "TripPlanner",
    sig: null,
    receipt_hash: "ax02",
    created_at: new Date().toISOString(),
  },
  {
    request_id: "preview-3",
    decision: "DENY",
    deny_code: "OVER_LIMIT",
    amount_usdc: 50.0,
    merchant: "TripPlanner",
    sig: null,
    receipt_hash: "ax03",
    created_at: new Date().toISOString(),
  },
];

// A clearly-labelled showcase DENY to splice in when the real feed has no
// blocked spends yet. The receipt_hash starts with "showcase:" so renderers
// can label it accurately and we never claim it landed on-chain.
const SHOWCASE_DENY: FeedItem = {
  request_id: "showcase-deny",
  decision: "DENY",
  deny_code: "OverCap",
  amount_usdc: 50,
  merchant: "TripPlanner",
  sig: null,
  receipt_hash: "showcase:over-cap-deny",
  created_at: new Date().toISOString(),
};

export function WatchAgentDemo() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isReal, setIsReal] = useState(false);

  useEffect(() => {
    let stop = false;
    let lastSig = "";
    async function tick() {
      try {
        const r = await fetch("/api/landing/feed");
        const d = await r.json();
        if (stop) return;
        const real = (d?.items ?? []) as FeedItem[];
        const sig =
          real.length >= 2
            ? real.slice(0, 8).map((x) => x.request_id).join("|")
            : "preview";
        if (sig === lastSig) return;
        lastSig = sig;
        if (real.length >= 2) {
          // The policy engine's defining feature is blocking spends. If the
          // real feed has no DENY in the visible window, splice in a
          // clearly-labelled showcase row so the page demonstrates both
          // outcomes — ALLOW and DENY — instead of looking ALLOW-only.
          const visible = real.slice(0, 8);
          const hasDeny = visible.some((it) => it.decision === "DENY");
          setItems(hasDeny ? visible : [SHOWCASE_DENY, ...visible].slice(0, 8));
          setIsReal(true);
        } else {
          setItems(PREVIEW);
          setIsReal(false);
        }
      } catch {
        if (stop || lastSig === "preview") return;
        lastSig = "preview";
        setItems(PREVIEW);
        setIsReal(false);
      }
    }
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const stats = useMemo(() => {
    const allowed = items.filter((i) => i.decision === "ALLOW").length;
    const blocked = items.filter((i) => i.decision === "DENY").length;
    const settled = items
      .filter((i) => i.decision === "ALLOW")
      .reduce((acc, i) => acc + i.amount_usdc, 0);
    return { allowed, blocked, settled };
  }, [items]);

  return (
    <div data-testid="watch-demo" style={{ marginTop: 32 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", gap: 14, color: "#9aa0a6", fontSize: 13 }}>
          <span>
            <b style={{ color: "#27c93f" }}>{stats.allowed}</b> allowed
          </span>
          <span>
            <b style={{ color: "#ff5f56" }}>{stats.blocked}</b> blocked
          </span>
          <span>
            <b style={{ color: "#fff" }}>${stats.settled.toFixed(2)}</b> settled
          </span>
        </div>
        <span
          data-testid="watch-mode-pill"
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 11,
            background: isReal ? "rgba(39,201,63,0.15)" : "rgba(255,189,46,0.15)",
            color: isReal ? "#27c93f" : "#ffbd2e",
            border: `1px solid ${isReal ? "rgba(39,201,63,0.4)" : "rgba(255,189,46,0.4)"}`,
            fontWeight: 600,
          }}
        >
          {isReal ? "live · on-chain" : "preview · scenario"}
        </span>
      </div>

      <div
        // a11y: live ledger of agent decisions. polite + non-atomic so
        // SR users hear new spends/blocks without re-reading old rows.
        aria-live="polite"
        aria-atomic="false"
        aria-label="Agent spending ledger"
        role="log"
        style={{
          background: "#111114",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {items.map((it) => (
          <Row key={it.request_id} item={it} isReal={isReal} />
        ))}
      </div>
    </div>
  );
}

function Row({ item, isReal }: { item: FeedItem; isReal: boolean }) {
  const allow = item.decision === "ALLOW";
  const isShowcase =
    item.request_id.startsWith("showcase-") ||
    (item.receipt_hash ?? "").startsWith("showcase:");
  return (
    <div
      data-testid={`watch-row-${item.decision.toLowerCase()}`}
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr auto",
        gap: 12,
        padding: "14px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: allow ? "#27c93f" : "#ff5f56",
          fontSize: 13,
        }}
      >
        {allow ? "✓ ALLOWED" : "✗ BLOCKED"}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          ${item.amount_usdc.toFixed(2)}
        </span>
        <span style={{ color: "#9aa0a6", fontSize: 13 }}>→ {short(item.merchant)}</span>
        {!allow && item.deny_code ? (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 6,
              background: "rgba(255,95,86,0.12)",
              color: "#ff5f56",
              fontWeight: 600,
            }}
          >
            {item.deny_code}
          </span>
        ) : null}
        {isShowcase ? (
          <span
            title="Synthetic example. Real DENY events stream the same shape."
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 6,
              background: "rgba(255,189,46,0.12)",
              color: "#ffbd2e",
              fontWeight: 600,
            }}
          >
            showcase
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {isReal && !isShowcase && item.sig ? (
          <a
            data-testid="watch-tx-link"
            href={getSolscanUrl(item.sig)}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#7c93ff", fontSize: 12, textDecoration: "underline" }}
          >
            tx ↗
          </a>
        ) : null}
        {!isShowcase &&
        item.request_id &&
        !item.request_id.startsWith("preview-") ? (
          <a
            data-testid="watch-receipt-link"
            href={`/r/${item.request_id}`}
            style={{ color: "#9aa0a6", fontSize: 12, textDecoration: "underline" }}
          >
            receipt →
          </a>
        ) : null}
      </div>
    </div>
  );
}

function short(s: string | null): string {
  if (!s) return "—";
  if (s.length <= 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
