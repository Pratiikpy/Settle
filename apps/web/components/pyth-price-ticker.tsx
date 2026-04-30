"use client";

import { useEffect, useState } from "react";

/**
 * Live Pyth Hermes price ticker.
 *
 * Polls /api/price/sol-usd every 5s, renders a small inline price chip with the
 * publish-time age. Visually demonstrates "live oracle" without requiring an
 * on-chain post — the Hermes pull pattern is purely client-readable.
 *
 * Pyth feed reference (universal across Solana mainnet + devnet):
 *   SOL/USD: ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
 *
 * The endpoint at /api/price/sol-usd is the single CORS-safe + cacheable proxy
 * to https://hermes.pyth.network. We don't fetch Hermes directly from the
 * browser to avoid rate-limit hits across many user sessions.
 */

interface PythResponse {
  ok: true;
  symbol: string;
  usd: number;
  confidence: number;
  publish_time: number;
  feed_id: string;
  source: string;
}

interface PythError {
  error: string;
  message?: string;
}

const POLL_MS = 5_000;
const STALE_AFTER_MS = 30_000;

export function PythPriceTicker({
  className,
  showSource = true,
}: {
  className?: string;
  showSource?: boolean;
}) {
  const [price, setPrice] = useState<PythResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tickAt, setTickAt] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    async function fetchOne() {
      try {
        const r = await fetch("/api/price/sol-usd", { cache: "no-store" });
        const data = (await r.json()) as PythResponse | PythError;
        if (cancelled) return;
        if ("ok" in data) {
          setPrice(data);
          setError(null);
        } else {
          setError(data.message ?? data.error);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setTickAt(Date.now());
      }
    }
    void fetchOne();
    const id = window.setInterval(() => void fetchOne(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Re-render the age string every second so "updated 4s ago" stays accurate
  // even between polls.
  useEffect(() => {
    const id = window.setInterval(() => setTickAt(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  if (!price) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] text-foreground/40 ${className ?? ""}`}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/30" />
        <span>{error ? `Pyth offline: ${error}` : "Loading SOL/USD…"}</span>
      </span>
    );
  }

  const ageMs = tickAt - price.publish_time * 1000;
  const ageSec = Math.max(0, Math.round(ageMs / 1000));
  const stale = ageMs > STALE_AFTER_MS;
  const ageDisplay = ageSec < 60 ? `${ageSec}s` : `${Math.round(ageSec / 60)}m`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] ${className ?? ""}`}
      title={`Pyth feed ${price.feed_id.slice(0, 10)}… · confidence ±$${price.confidence.toFixed(4)} · published ${new Date(price.publish_time * 1000).toISOString()}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          stale ? "bg-amber-400" : "animate-pulse bg-emerald-400"
        }`}
      />
      <span className="font-mono text-foreground/85">
        ${price.usd.toFixed(2)}
      </span>
      <span className="text-foreground/45">
        SOL/USD · {stale ? `stale ${ageDisplay}` : `${ageDisplay} ago`}
      </span>
      {showSource && (
        <span className="text-foreground/35">· {price.source}</span>
      )}
    </span>
  );
}
