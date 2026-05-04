import type { Metadata } from "next";

/**
 * Metadata for /request — the request-money page (someone shares a
 * request URL → payer lands here to fulfill it).
 */
export const metadata: Metadata = {
  title: "Request money · Settle",
  description:
    "Generate a request URL with @handle, amount, and note. Pasted into X / Discord / Telegram becomes a Phantom Blink — one-tap pay, cryptographic receipt back to you.",
};

export default function RequestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
