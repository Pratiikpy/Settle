"use client";

import { useEffect, useState } from "react";

/**
 * F3.12 Trust Score badge.
 *
 * Pill that shows the wallet's trust tier + numeric score, with a hover
 * tooltip that breaks down the formula:
 *
 *   log10(1 + counterparties) × allow_rate × inverse_dispute_rate
 *
 * The component fetches from `/api/trust/[pubkey]` lazily — render it
 * anywhere a pubkey is shown and it'll populate without extra wiring.
 *
 * Why a separate component over inlining the fetch in every page:
 *   - The trust score is a "decoration" everywhere (next to handles,
 *     merchant pubkeys, etc.). Centralizing the fetch + cache shape
 *     means dashboards, receipt pages, agent profiles, and the public
 *     feed all show consistent numbers.
 *   - The 5-min server-side cache + this in-component dedupe by pubkey
 *     means N badges for the same wallet on a page don't fan out.
 */
export interface TrustScoreBadgeProps {
  pubkey: string;
  /** "compact" = tier word only; "full" = tier + score number. */
  variant?: "compact" | "full";
  className?: string;
}

interface TrustData {
  pubkey: string;
  score: number;
  tier: "emerging" | "building" | "trusted" | "veteran";
  unique_counterparties: number;
  receipts_total: number;
  receipts_allowed: number;
  receipts_denied: number;
  refunds_count: number;
  allow_rate: number;
  inverse_dispute_rate: number;
}

const TIER_CLASSES: Record<TrustData["tier"], string> = {
  emerging: "border-foreground/15 bg-foreground/5 text-foreground/60",
  building: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  trusted: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  veteran: "border-violet-400/30 bg-violet-400/10 text-violet-300",
};

const TIER_LABELS: Record<TrustData["tier"], string> = {
  emerging: "emerging",
  building: "building",
  trusted: "trusted",
  veteran: "veteran",
};

// In-memory dedupe across simultaneous mounts so N badges for the same
// pubkey on one page only do 1 fetch.
const inflight: Record<string, Promise<TrustData | null>> = {};

async function fetchTrust(pubkey: string): Promise<TrustData | null> {
  if (inflight[pubkey]) return inflight[pubkey]!;
  inflight[pubkey] = (async () => {
    try {
      const res = await fetch(`/api/trust/${pubkey}`);
      if (!res.ok) return null;
      const j = await res.json();
      if (!j.ok) return null;
      return j as TrustData;
    } catch {
      return null;
    } finally {
      // Allow re-fetch after 60s.
      setTimeout(() => {
        delete inflight[pubkey];
      }, 60_000);
    }
  })();
  return inflight[pubkey]!;
}

export function TrustScoreBadge({
  pubkey,
  variant = "compact",
  className,
}: TrustScoreBadgeProps) {
  const [data, setData] = useState<TrustData | null>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchTrust(pubkey).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  // Loading skeleton — short, neutral, doesn't shift layout once data lands.
  if (!data) {
    return (
      <span
        className={[
          "inline-flex h-5 w-16 animate-pulse items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.03] text-[10px]",
          className ?? "",
        ].join(" ")}
        aria-busy
      />
    );
  }

  const tierClass = TIER_CLASSES[data.tier];
  const scoreText = data.score.toFixed(2);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
          tierClass,
          className ?? "",
        ].join(" ")}
        aria-label={`Trust tier ${data.tier}, score ${scoreText}`}
      >
        <span>{TIER_LABELS[data.tier]}</span>
        {variant === "full" && (
          <span className="font-mono lowercase text-foreground/80">
            {scoreText}
          </span>
        )}
      </button>

      {hover && (
        <div
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-foreground/15 bg-background/95 p-3 text-left text-[11px] shadow-lg backdrop-blur"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-foreground/80">
              Trust score: {scoreText}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-foreground/40">
              {data.tier}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-foreground/60">
            <span>counterparties</span>
            <span className="text-right font-mono text-foreground/80">
              {data.unique_counterparties}
            </span>
            <span>receipts</span>
            <span className="text-right font-mono text-foreground/80">
              {data.receipts_total}
            </span>
            <span>allow rate</span>
            <span className="text-right font-mono text-foreground/80">
              {(data.allow_rate * 100).toFixed(1)}%
            </span>
            <span>refunds</span>
            <span className="text-right font-mono text-foreground/80">
              {data.refunds_count}
            </span>
          </div>
          <div className="mt-2 border-t border-foreground/10 pt-2 text-[10px] text-foreground/40">
            log<sub>10</sub>(1 + counterparties) × allow_rate × (1 − dispute_rate)
          </div>
        </div>
      )}
    </span>
  );
}
