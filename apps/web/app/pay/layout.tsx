import type { Metadata } from "next";

/**
 * Metadata for /pay — the embeddable pay page used by merchants.
 */
export const metadata: Metadata = {
  title: "Pay with Settle",
  description:
    "Pay any merchant on Solana with USDC. Sub-second confirmation. Cryptographic receipt the merchant cannot tamper with — yours forever.",
};

export default function PayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
