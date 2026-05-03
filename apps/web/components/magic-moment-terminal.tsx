"use client";

import { useEffect, useState } from "react";
import { getSolscanUrl } from "../lib/solana";

/**
 * Magic-moment terminal — auto-plays a feed of REAL receipts (ALLOW + DENY)
 * pulled from /api/landing/feed. Each line links to a real Solscan tx.
 *
 * If the feed is empty (e.g. fresh devnet), we fall back to a clearly-
 * labelled "scenario preview" so the landing never lies. Real on-chain
 * lines get a "✓ on-chain" pill; preview lines get a "preview" pill.
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

const SCENARIO: FeedItem[] = [
  {
    request_id: "scn-allow-1",
    decision: "ALLOW",
    deny_code: null,
    amount_usdc: 4.2,
    merchant: "TripPlanner",
    sig: null,
    receipt_hash: "a7f29e",
    created_at: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    request_id: "scn-deny-1",
    decision: "DENY",
    deny_code: "OVER_LIMIT",
    amount_usdc: 50.0,
    merchant: "TripPlanner",
    sig: null,
    receipt_hash: "b8e12c",
    created_at: new Date(Date.now() - 30_000).toISOString(),
  },
  {
    request_id: "scn-allow-2",
    decision: "ALLOW",
    deny_code: null,
    amount_usdc: 1.99,
    merchant: "ResearchBot",
    sig: null,
    receipt_hash: "c3d4f1",
    created_at: new Date(Date.now() - 10_000).toISOString(),
  },
];

function timeStr(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

function shortMerchant(m: string | null): string {
  if (!m) return "—";
  if (m.length <= 12) return m;
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

export function MagicMomentTerminal() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isReal, setIsReal] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let lastSig = "";
    async function refresh() {
      try {
        const r = await fetch("/api/landing/feed");
        const d = await r.json();
        if (cancelled) return;
        const real = (d?.items ?? []) as FeedItem[];
        // Compute a stable signature so we only restart the animation
        // when the underlying receipts actually change (not every poll).
        const sig =
          real.length >= 2
            ? real.slice(0, 8).map((x) => x.request_id).join("|")
            : "scenario";
        if (sig === lastSig) return;
        lastSig = sig;
        if (real.length >= 2) {
          setItems(real.slice(0, 8));
          setIsReal(true);
        } else {
          setItems(SCENARIO);
          setIsReal(false);
        }
      } catch {
        if (cancelled || lastSig === "scenario") return;
        lastSig = "scenario";
        setItems(SCENARIO);
        setIsReal(false);
      }
    }
    refresh();
    // Poll every 60s so a long-open landing tab picks up new receipts.
    // The signature check above keeps the animation steady when nothing
    // has changed; /api/landing/feed has 30s s-maxage caching upstream.
    const id = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    // Respect prefers-reduced-motion: show everything at once, no animation.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(items.length);
      return;
    }
    setShown(0);
    const id = setInterval(() => {
      setShown((n) => {
        if (n >= items.length) {
          // Loop forever after a brief pause.
          return 0;
        }
        return n + 1;
      });
    }, 1100);
    return () => clearInterval(id);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section
      data-testid="magic-moment-terminal"
      aria-label="Live agent activity"
      style={{
        maxWidth: 880,
        margin: "32px auto 16px",
        background: "#0a0a0c",
        color: "#e6e6e8",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          color: "#9aa0a6",
        }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#ff5f56",
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#ffbd2e",
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#27c93f",
            }}
          />
          <span style={{ marginLeft: 12, fontWeight: 500 }}>
            settle://live
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            data-testid="feed-mode-pill"
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 11,
              background: isReal ? "rgba(39,201,63,0.15)" : "rgba(255,189,46,0.15)",
              color: isReal ? "#27c93f" : "#ffbd2e",
              border: `1px solid ${isReal ? "rgba(39,201,63,0.4)" : "rgba(255,189,46,0.4)"}`,
            }}
          >
            {isReal ? "live · on-chain" : "preview · scenario"}
          </span>
        </div>
      </header>
      <div
        // a11y: announce new lines politely to screen readers without
        // interrupting their current speech. atomic=false so SR reads
        // only the newly added line, not the whole transcript.
        aria-live="polite"
        aria-atomic="false"
        role="log"
        style={{
          padding: "14px 18px",
          minHeight: 240,
          maxHeight: 280,
          overflow: "hidden",
        }}
      >
        {items.slice(0, shown).map((it, idx) => (
          <Line key={`${it.request_id}-${idx}`} item={it} isReal={isReal} />
        ))}
        {shown < items.length && (
          <div aria-hidden="true" style={{ color: "#5a5f66" }}>
            <span style={{ animation: "blink 1s steps(1) infinite" }}>▮</span>
          </div>
        )}
      </div>
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="magic-moment-terminal"] [style*="animation"] {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}

function Line({ item, isReal }: { item: FeedItem; isReal: boolean }) {
  const allow = item.decision === "ALLOW";
  const color = allow ? "#27c93f" : "#ff5f56";
  const symbol = allow ? "✓" : "✗";
  const verb = allow ? "allowed" : "BLOCKED";
  const reason = !allow
    ? ` (${(item.deny_code || "RULE_VIOLATION").toLowerCase()})`
    : "";
  const sig = item.sig;
  return (
    <div
      data-testid={`mm-line-${item.decision.toLowerCase()}`}
      style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
    >
      <span style={{ color: "#5a5f66" }}>
        [{timeStr(item.created_at)}]
      </span>
      <span style={{ color: "#9aa0a6" }}>agent</span>
      <span style={{ color: "#e6e6e8" }}>
        @{shortMerchant(item.merchant)}
      </span>
      <span style={{ color: "#9aa0a6" }}>
        ${item.amount_usdc.toFixed(2)}
      </span>
      <span style={{ color }}>
        → {symbol} {verb}
        {reason}
      </span>
      {isReal && sig ? (
        <a
          data-testid="mm-tx-link"
          href={getSolscanUrl(sig)}
          target="_blank"
          rel="noreferrer"
          style={{ color: "#7c93ff", textDecoration: "underline" }}
        >
          view tx ↗
        </a>
      ) : null}
      {item.receipt_hash ? (
        <span style={{ color: "#5a5f66" }}>#{item.receipt_hash.slice(0, 6)}</span>
      ) : null}
    </div>
  );
}
