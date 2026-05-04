import type { Metadata } from "next";

/**
 * Metadata-only layout for /verify. The page itself is "use client"
 * (it uses useState/useEffect for the lifecycle animation) so it
 * can't directly export metadata. This server-component layout adds
 * the title + description that search engines and link previews use,
 * without affecting the page's React tree.
 */
export const metadata: Metadata = {
  title: "Verify any Settle receipt",
  description:
    "Paste any of the 5 commit-chain hashes (receipt, reason, policy, purpose, context) or a Solana transaction signature. Walletless. Recomputes the chain client-side and proves the spend was authorized on-chain.",
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
