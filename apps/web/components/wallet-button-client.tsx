"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * @solana/wallet-adapter-react-ui's WalletMultiButton renders different DOM
 * on the server vs the client (server has no wallet state, client populates
 * the icon + dropdown after `useWallet()` resolves), which trips React's
 * hydration checker. Loading it via next/dynamic with ssr: false renders a
 * tiny placeholder during SSR and mounts the real button only after the
 * client takes over - no hydration diff possible.
 */
export const WalletButton: ComponentType = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((mod) => ({
      default: mod.WalletMultiButton,
    })),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        className="h-11 rounded-md bg-foreground/10 px-4 text-sm text-foreground/40"
        disabled
      >
        Connect wallet
      </button>
    ),
  },
);
