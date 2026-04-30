"use client";

import { motion } from "framer-motion";
import { DenyBadge, type DenyDecision } from "./deny-badge.js";

export interface ActivityRowProps {
  card: string;            // "@pratiik/research"
  merchant: string;        // "ArxivFetch"
  amountUsdc: string;      // "$0.10"
  decision: DenyDecision;
  denyCode?: number;
  latencyMs?: number;      // "0.4s on Solana"
  solscanHref?: string;
  ts?: string;             // "2m ago" or "00:14"
}

export function ActivityRow({
  card,
  merchant,
  amountUsdc,
  decision,
  denyCode,
  latencyMs,
  solscanHref,
  ts,
}: ActivityRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.04]"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          <span className="text-white/50">{card}</span>{" "}
          <span className="text-white/30">→</span>{" "}
          <span className="font-medium">{merchant}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/40">
          {ts && <span>{ts}</span>}
          {latencyMs !== undefined && (
            <>
              <span>·</span>
              <span>{(latencyMs / 1000).toFixed(1)}s on Solana</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 pl-4">
        <span className="font-mono text-sm tabular-nums">{amountUsdc}</span>
        <DenyBadge decision={decision} {...(denyCode !== undefined ? { denyCode } : {})} />
        {solscanHref && (
          <a
            href={solscanHref}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-white/40 hover:text-[#14F195]"
          >
            ↗
          </a>
        )}
      </div>
    </motion.div>
  );
}
