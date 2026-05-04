import type { Metadata } from "next";

/**
 * /pay/[token] is a one-time-use payment URL. Shouldn't be indexed —
 * the token is meant for a single recipient. Inherits title +
 * description from /pay/layout.tsx but overrides robots to noindex.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PayTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
