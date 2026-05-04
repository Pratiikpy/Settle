import type { Metadata } from "next";

/**
 * Metadata layout for /stats. Page is "use client" (live polling).
 */
export const metadata: Metadata = {
  title: "Network stats · Settle",
  description:
    "Live network transparency for Settle on Solana — receipts per day/week/all-time, USDC volume, capability rankings, decision histogram. Verifiable money, verifiable in aggregate.",
};

export default function StatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
