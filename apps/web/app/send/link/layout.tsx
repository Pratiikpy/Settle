import type { Metadata } from "next";

/**
 * Override for /send/link — the one-time-use payment link generator.
 */
export const metadata: Metadata = {
  title: "Send by link · Settle",
  description:
    "Generate a one-time-use payment URL with USDC pre-loaded. Share by DM, email, or QR. Recipient claims with a single click — no wallet pre-setup needed.",
};

export default function SendLinkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
