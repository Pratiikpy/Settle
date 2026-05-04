import type { Metadata } from "next";

/**
 * Default metadata for /capabilities/* surfaces. Both /capabilities
 * and /capabilities/discover are "use client" so this server-component
 * layout owns metadata. Sub-routes can override via Next.js metadata
 * merging.
 */
export const metadata: Metadata = {
  title: "Capability registry · Settle",
  description:
    "Browse the Solana-native capability registry. Each verified capability is a hashable contract a merchant publishes — agents pin to it, receipts attest to it, reputation grows from it.",
};

export default function CapabilitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
