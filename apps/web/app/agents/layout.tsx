import type { Metadata } from "next";

/**
 * Default metadata for /agents/* surfaces. The /agents page is
 * "use client" so it can't directly export metadata. Sub-routes
 * with their own metadata (e.g. /agents/templates/[slug]) override
 * via Next.js metadata merging.
 */
export const metadata: Metadata = {
  title: "AI agents · Settle",
  description:
    "Hire AI agents that spend with cryptographically scoped permissions on Solana. Set rules. Watch every receipt. Revoke instantly. Built for the agentic economy.",
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
