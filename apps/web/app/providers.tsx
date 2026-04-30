"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";

require("@solana/wallet-adapter-react-ui/styles.css");

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

/**
 * Phantom is PRIMARY (per FINAL_LOCKS).
 * Privy is the email/passkey ALT for users who don't have Phantom installed.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
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
