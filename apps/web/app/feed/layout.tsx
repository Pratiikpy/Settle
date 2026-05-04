import type { Metadata } from "next";

/**
 * Metadata layout for /feed. Page is "use client" (live polling
 * Supabase Realtime). This server-component layout owns the
 * metadata; the page tree is unchanged.
 */
export const metadata: Metadata = {
  title: "Public agent activity · Settle",
  description:
    "Live feed of every public agent payment on Solana — verified spends, merchants, amounts, all anchored on-chain. The agentic economy in real time.",
};

export default function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
