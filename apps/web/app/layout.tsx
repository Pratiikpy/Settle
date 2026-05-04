import type { Metadata } from "next";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import { w6Sans, w6Heading, w6Mono } from "./fonts";
import { Providers } from "./providers";
import { Header } from "../components/header";
import { CommandPalette } from "../components/command-palette";
import { ThemeProvider } from "../components/theme-provider";
import { RouteTransition } from "../components/route-transition";

export const metadata: Metadata = {
  // Resolves all relative metadata URLs (og:image, twitter:image,
  // alternates) against this base when bots scrape the page in
  // production. Without it, Next emits a build warning and resolves
  // to http://localhost:3000 — which breaks Twitter/Slack/Discord
  // previews when the site is deployed.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://settle.so",
  ),
  title: "Settle — Pay anyone. Hire any AI. Trust the receipts.",
  description:
    "The payment app for the AI age. On Solana. Send anyone money. Hire AI agents to spend on your behalf with cryptographically scoped permissions. Every cent provable on-chain.",
  openGraph: {
    title: "Settle — Pay anyone. Hire any AI. Trust the receipts.",
    description: "The payment app for the AI age. On Solana.",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Settle — Pay anyone. Hire any AI. Trust the receipts.",
    description: "The payment app for the AI age. On Solana.",
    images: ["/api/og"],
  },
};

/**
 * Mobile browser chrome color — matches the W6 light bg so the
 * address bar tints correctly on iOS Safari + Android Chrome.
 * Two values respect light/dark preference. Note: in Next 15+
 * themeColor lives on `viewport` (separate export), not metadata.
 */
export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${w6Sans.variable} ${w6Heading.variable} ${w6Mono.variable}`}
    >
      <head>
        {/* F1.7 — sync theme bootstrap. Must run BEFORE React hydrates so
            the document doesn't flash light-on-dark for users on the
            light-system + dark-default-brand mismatch. Strategy
            beforeInteractive ensures this. */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        style={{
          background: "var(--w6-bg-2)",
          color: "var(--w6-ink)",
        }}
      >
        <ThemeProvider>
          <Providers>
            <Header />
            <RouteTransition>{children}</RouteTransition>
            {/* F1.6 — global Cmd+K palette mounts at root so the keyboard
                shortcut works on every page without per-page wiring. */}
            <CommandPalette />
            <Toaster
              position="bottom-center"
              toastOptions={{
                style: {
                  background: "var(--w6-paper-2)",
                  border: "1.5px solid var(--w6-rule)",
                  color: "var(--w6-ink)",
                  borderRadius: "8px",
                  boxShadow: "var(--w6-shadow-md)",
                },
              }}
            />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
