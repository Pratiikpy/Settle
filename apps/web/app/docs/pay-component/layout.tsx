import type { Metadata } from "next";

/**
 * Metadata layout for /docs/pay-component. Page is "use client"
 * (live demo state) so this server-component layout owns metadata.
 */
export const metadata: Metadata = {
  title: "<settle-pay> · Settle web component",
  description:
    "Drop-in <settle-pay> web component for any HTML page. One <script> tag, one element, real Solana payment with cryptographic receipt — no React required.",
};

export default function PayComponentDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
