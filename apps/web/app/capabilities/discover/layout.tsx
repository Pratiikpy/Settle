import type { Metadata } from "next";

/**
 * Metadata for /capabilities/discover. Overrides the parent
 * /capabilities layout's default with a more search-specific copy.
 */
export const metadata: Metadata = {
  title: "Discover capabilities · Settle",
  description:
    "Search the Solana capability registry by name or domain. Find verified merchants and the on-chain receipts that prove their service quality.",
};

export default function CapabilitiesDiscoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
