import type { Metadata } from "next";

/**
 * /pay/widget is the iframe-embeddable variant of /pay. Same
 * reasoning as /embed/* — widgets shouldn't appear standalone in
 * search results.
 */
export const metadata: Metadata = {
  title: "Pay widget · Settle",
  robots: { index: false, follow: false },
};

export default function PayWidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
