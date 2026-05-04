import type { Metadata } from "next";

/**
 * Default metadata for /send/* surfaces. Each sub-route can override
 * via Next.js metadata merging (e.g. /send/link has its own copy via
 * the page or a sub-layout).
 */
export const metadata: Metadata = {
  title: "Send money on Solana · Settle",
  description:
    "Send USDC to anyone with a @handle, a Solana pubkey, or a one-time link. Every payment carries a cryptographic receipt anchored on-chain — verify any cent forever.",
};

export default function SendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
