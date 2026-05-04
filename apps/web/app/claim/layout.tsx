import type { Metadata } from "next";

/**
 * Metadata layout for /claim/[escrow]. Disallowed in robots.txt
 * (one-time-use URLs shouldn't be crawled — the secret lives in
 * the URL fragment, but bots could still drain rent or trigger
 * the one-time-use idempotency lock prematurely). Recipients
 * still benefit from a meaningful tab title when they open the
 * URL directly.
 */
export const metadata: Metadata = {
  title: "Claim USDC · Settle",
  description:
    "Someone sent you USDC on Solana. Open the link, sign once, claim it to your wallet. The receipt is yours forever — verifiable on-chain.",
  // Don't index even by accident — robots.txt is the primary block.
  robots: { index: false, follow: false },
};

export default function ClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
