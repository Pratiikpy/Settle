"use client";

import { motion } from "framer-motion";
import { CountdownRing } from "./countdown-ring.js";

/**
 * Single-task Pact card visual.
 * Shows used/cap as countdown ring + allowlist + expiry + revoke CTA.
 */
export interface PactCardProps {
  label: string;             // "Pact · Research"
  capUsdc: string;           // "$0.50"
  usedUsdc: string;          // "$0.45"
  fillPct: number;           // 0..1
  allowlist: string[];       // ["ArxivFetch", ...]
  expiryLabel: string;       // "12:43"
  revoked?: boolean;
  onRevoke?: () => void;
  className?: string;
}

export function PactCard({
  label,
  capUsdc,
  usedUsdc,
  fillPct,
  allowlist,
  expiryLabel,
  revoked,
  onRevoke,
  className,
}: PactCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={[
        "relative overflow-hidden rounded-3xl border border-white/10 pact-surface p-6 shadow-card",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-white/50">{label}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight">{usedUsdc}</span>
            <span className="text-xs text-white/40">of {capUsdc}</span>
          </div>
          <div className="mt-1 text-xs text-white/40">expires {expiryLabel}</div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {allowlist.slice(0, 4).map((m) => (
              <span
                key={m}
                className="rounded-full border border-[#14F195]/30 bg-[#14F195]/10 px-2.5 py-0.5 text-[10px] text-[#14F195]"
              >
                {m}
              </span>
            ))}
            {allowlist.length > 4 && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-white/50">
                +{allowlist.length - 4}
              </span>
            )}
          </div>
        </div>

        <CountdownRing value={fillPct} size={88} strokeWidth={5}>
          <span className="text-xs font-mono text-white/70">{Math.round(fillPct * 100)}%</span>
        </CountdownRing>
      </div>

      {!revoked && onRevoke && (
        <button
          onClick={onRevoke}
          className="mt-5 w-full rounded-full border border-red-500/30 bg-red-500/5 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
        >
          Revoke this Pact
        </button>
      )}

      {revoked && (
        <div className="mt-5 rounded-full bg-white/5 py-2 text-center text-xs text-white/50">
          Revoked
        </div>
      )}
    </motion.div>
  );
}
