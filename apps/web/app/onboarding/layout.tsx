import type { Metadata } from "next";

/**
 * Metadata layout for /onboarding (the guided wallet-required first-run
 * flow). Disallowed in robots.txt — bots can't connect a wallet — but
 * users still benefit from a meaningful tab title.
 *
 * The public, crawlable version of onboarding is /start/* (3-fork
 * picker, no wallet required to read).
 */
export const metadata: Metadata = {
  title: "Get started · Settle",
  description:
    "Guided 60-second first-run on Solana — connect Phantom, get devnet funds, create your first agent budget. Every step verifiable on-chain.",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
