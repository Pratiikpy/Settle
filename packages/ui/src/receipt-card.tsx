"use client";

import { motion } from "framer-motion";
import { DenyBadge, type DenyDecision } from "./deny-badge";

export interface ReceiptCardProps {
  merchant: string;
  amountUsdc: string;
  note?: string;
  decision: DenyDecision;
  denyCode?: number;
  solscanHref?: string;
  cnftHref?: string;
  onVerify?: () => void;
  verified?: boolean;
}

export function ReceiptCard({
  merchant,
  amountUsdc,
  note,
  decision,
  denyCode,
  solscanHref,
  cnftHref,
  onVerify,
  verified,
}: ReceiptCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{merchant}</span>
            <DenyBadge decision={decision} {...(denyCode !== undefined ? { denyCode } : {})} />
          </div>
          {note && <div className="mt-0.5 truncate text-xs text-white/50">{note}</div>}
        </div>
        <div className="font-mono text-sm tabular-nums">{amountUsdc}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
        <button
          onClick={onVerify}
          className={[
            "rounded-full px-2.5 py-1 transition",
            verified
              ? "bg-[#14F195]/10 text-[#14F195]"
              : "bg-white/5 text-white/60 hover:bg-white/10",
          ].join(" ")}
        >
          {verified ? "verifyReceipt() ✓" : "verifyReceipt()"}
        </button>
        {solscanHref && (
          <a
            href={solscanHref}
            target="_blank"
            rel="noreferrer"
            className="text-white/40 hover:text-[#14F195]"
          >
            Solscan ↗
          </a>
        )}
        {cnftHref && (
          <a
            href={cnftHref}
            target="_blank"
            rel="noreferrer"
            className="text-white/40 hover:text-[#14F195]"
          >
            cNFT ↗
          </a>
        )}
      </div>
    </motion.div>
  );
}
