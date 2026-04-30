"use client";

import { motion } from "framer-motion";

/**
 * Hero card — Cash-Card-tier visual.
 * Renders @handle + balance + subtle Solana gradient + ambient glow.
 */
export interface SettleCardProps {
  handle: string;          // e.g. "@pratiik"
  balance: string;         // e.g. "$25.00"
  symbol?: string;         // e.g. "USDC"
  subline?: string;        // e.g. "Devnet"
  variant?: "main" | "pact" | "cnft";
  size?: "default" | "compact";
  className?: string;
}

export function SettleCard({
  handle,
  balance,
  symbol = "USDC",
  subline,
  variant = "main",
  size = "default",
  className,
}: SettleCardProps) {
  const surface =
    variant === "pact" ? "pact-surface" : variant === "cnft" ? "cnft-surface" : "card-surface";
  const padding = size === "compact" ? "p-5" : "p-7";
  const balanceSize = size === "compact" ? "text-3xl" : "text-5xl";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={[
        "relative overflow-hidden rounded-3xl border border-white/10 shadow-card",
        surface,
        padding,
        className ?? "",
      ].join(" ")}
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/60">{handle}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
          {variant === "pact" ? "Pact" : variant === "cnft" ? "Receipt" : symbol}
        </span>
      </div>

      {/* Balance */}
      <div className="mt-8">
        <div className={["font-semibold tracking-tight", balanceSize].join(" ")}>{balance}</div>
        {subline && <div className="mt-1 text-xs text-white/40">{subline}</div>}
      </div>

      {/* Bottom shimmer accent */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    </motion.div>
  );
}
