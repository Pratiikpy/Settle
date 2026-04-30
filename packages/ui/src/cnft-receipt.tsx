"use client";

import { motion } from "framer-motion";

/**
 * Visual representation of a Bubblegum V2 cNFT receipt.
 * Used in /cards/[id] when the user successfully completes an agent task.
 * Conic-gradient surface gives the "rare collectible" feel.
 */
export interface CnftReceiptProps {
  index: number;             // "Settle Receipt #N"
  merchant: string;
  amountUsdc: string;
  cnftAddress?: string;      // base58 mint address
  className?: string;
}

export function CnftReceipt({ index, merchant, amountUsdc, cnftAddress, className }: CnftReceiptProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, rotate: -3 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={[
        "relative overflow-hidden rounded-3xl border border-white/15 cnft-surface p-6 shadow-glow",
        className ?? "",
      ].join(" ")}
    >
      <div className="absolute inset-0 backdrop-blur-3xl" />
      <div className="relative">
        <div className="text-[10px] font-medium uppercase tracking-widest text-white/70">
          Settle Receipt
        </div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">#{index}</div>

        <div className="mt-6 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-white/60">Merchant</span>
            <span className="font-medium">{merchant}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Amount</span>
            <span className="font-mono">{amountUsdc}</span>
          </div>
          {cnftAddress && (
            <div className="flex justify-between">
              <span className="text-white/60">cNFT</span>
              <span className="font-mono text-[10px]">
                {cnftAddress.slice(0, 4)}…{cnftAddress.slice(-4)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 text-[10px] uppercase tracking-widest text-white/40">
          Bubblegum V2 · Solana
        </div>
      </div>
    </motion.div>
  );
}
