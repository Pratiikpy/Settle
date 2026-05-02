"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CountdownRing } from "./countdown-ring";

/**
 * Single-task Pact card visual.
 * Shows used/cap as countdown ring + allowlist + expiry + revoke CTA.
 *
 * F3.8 Killchain — when `revoked` flips true, the card frosts over (CSS
 * filter cocktail of saturate-down + brightness-up + hue-rotate to icy
 * blue + blur) and a shatter overlay plays once. `prefers-reduced-motion`
 * keeps the static frost but skips the shatter particles.
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

const FROST_FILTER =
  "saturate(0.35) brightness(1.18) hue-rotate(180deg) blur(0.4px)";

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
      {/* Frost overlay — fades in over ~700ms when revoked toggles true.
          Uses backdrop-filter so the underlying card content is visible
          but visibly chilled out. */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 rounded-3xl"
        initial={false}
        animate={{
          opacity: revoked ? 1 : 0,
          backdropFilter: revoked ? FROST_FILTER : "none",
        }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{
          backgroundImage: revoked
            ? "radial-gradient(ellipse at top left, rgba(199,229,255,0.12), transparent 65%), radial-gradient(ellipse at bottom right, rgba(255,255,255,0.06), transparent 70%)"
            : undefined,
        }}
        aria-hidden
      />

      {/* Shatter overlay — plays once on the false→true transition. Skipped
          on prefers-reduced-motion via a media-query class on the parent. */}
      <AnimatePresence>
        {revoked && (
          <motion.div
            key="shatter"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [1, 1.02, 1.04, 1.06] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.4, 0, 0.6, 1] }}
            className="pointer-events-none absolute inset-0 z-20 rounded-3xl motion-reduce:hidden"
            aria-hidden
          >
            <svg
              className="h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="shard" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="rgba(199,229,255,0.7)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.0)" />
                </linearGradient>
              </defs>
              {/* A handful of triangular shards radiating from the center. */}
              {[
                "M50,50 L20,5 L42,8 Z",
                "M50,50 L45,3 L60,5 Z",
                "M50,50 L75,8 L92,30 Z",
                "M50,50 L95,55 L88,80 Z",
                "M50,50 L65,95 L40,92 Z",
                "M50,50 L20,90 L8,65 Z",
                "M50,50 L5,40 L8,15 Z",
              ].map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="url(#shard)"
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth="0.3"
                />
              ))}
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-0 flex items-start justify-between gap-6">
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
          className="relative z-0 mt-5 w-full rounded-full border border-red-500/30 bg-red-500/5 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
        >
          Revoke this Pact
        </button>
      )}

      {revoked && (
        <div className="relative z-0 mt-5 rounded-full bg-white/5 py-2 text-center text-xs text-white/50">
          Revoked
        </div>
      )}
    </motion.div>
  );
}
