"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

/**
 * Wave 6.1 — wallet adapter on the landing nav.
 *
 * Wraps `WalletMultiButton` so the landing page exposes the same
 * "Sign in" affordance the rest of the app uses, AND so E2E
 * `connect-burner` helper can find the canonical
 * `.wallet-adapter-button-trigger` selector.
 *
 * Stylistically the button is the wallet-adapter default (already
 * skinned via globals). Wrapped in a span so we can size it down to
 * match the marketing nav's btn-sm visual rhythm.
 */
export function LandingWalletAdapter() {
  return (
    <span className="w6-landing-wallet">
      <WalletMultiButton />
      <style>{`
        .w6-landing-wallet .wallet-adapter-button-trigger,
        .w6-landing-wallet .wallet-adapter-button {
          height: 30px;
          padding: 0 14px;
          font-size: 12.5px;
          font-weight: 500;
          background: #fff;
          color: var(--w6-ink);
          border: 1px solid var(--w6-rule);
          border-radius: 999px;
        }
        .w6-landing-wallet .wallet-adapter-button-trigger:hover {
          background: var(--w6-bg-2);
        }
      `}</style>
    </span>
  );
}
