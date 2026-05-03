"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { UnsafeBurnerWalletAdapter } from "@solana/wallet-adapter-unsafe-burner";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SettleE2EBurnerAdapter } from "../components/settle-e2e-burner-adapter";

require("@solana/wallet-adapter-react-ui/styles.css");

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
// E2E test mode: include the unsafe burner adapter so Playwright can drive
// the React layer end-to-end without a real wallet popup. Gate behind an
// explicit env flag to ensure burner is NEVER active in production.
const E2E_BURNER_ENABLED =
  process.env.NEXT_PUBLIC_E2E_BURNER === "1" ||
  process.env.NEXT_PUBLIC_E2E_BURNER === "true";

/**
 * Phantom is PRIMARY (per FINAL_LOCKS).
 * Privy is the email/passkey ALT for users who don't have Phantom installed.
 * Burner is E2E-only — gated by NEXT_PUBLIC_E2E_BURNER.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => {
    const list: any[] = [new PhantomWalletAdapter()];
    if (E2E_BURNER_ENABLED) {
      // Settle E2E burner: loads keypair from localStorage["settle-e2e-burner-key"]
      // or NEXT_PUBLIC_E2E_BURNER_KEY, falls back to a random keypair if neither
      // is set (preserving legacy UnsafeBurnerWalletAdapter behavior).
      list.push(new SettleE2EBurnerAdapter());
      list.push(new UnsafeBurnerWalletAdapter());
    }
    return list;
  }, []);
  const [qc] = useState(() => new QueryClient());

  const inner = (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );

  // Privy wraps wallet adapter so passkey/email-auth users still hit the same downstream tree.
  if (!PRIVY_APP_ID) return inner;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "wallet", "passkey"],
        appearance: { theme: "dark", accentColor: "#82DCB4" },
      }}
    >
      {inner}
    </PrivyProvider>
  );
}
