import type { Metadata } from "next";

/**
 * /embed/* routes are designed to live inside a host page's iframe.
 * They have no standalone product meaning — search engines indexing
 * them would surface a context-less widget snippet that, when
 * clicked, opens the bare iframe URL. That's confusing for users.
 *
 * noindex stops them from appearing in search; the iframe host page
 * is what should be discoverable.
 */
export const metadata: Metadata = {
  title: "Settle embed",
  robots: { index: false, follow: false },
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
