import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "../components/header";

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <Header />
          {children}
          <Toaster
            position="bottom-center"
            theme="dark"
            toastOptions={{
              style: {
                background: "rgb(20 20 22)",
                border: "1px solid rgb(38 38 38)",
                color: "rgb(245 245 245)",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
