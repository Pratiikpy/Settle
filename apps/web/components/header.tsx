"use client";

import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Settle
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-foreground/60 md:flex">
          <Link href="/send" className="hover:text-foreground">
            Send
          </Link>
          <Link href="/agents" className="hover:text-foreground">
            Agents
          </Link>
          <Link href="/cards" className="hover:text-foreground">
            Cards
          </Link>
          <Link href="/feed" className="hover:text-foreground">
            Feed
          </Link>
          <Link href="/activity" className="hover:text-foreground">
            Activity
          </Link>
          <Link href="/sandbox" className="hover:text-foreground">
            Sandbox
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
