"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { fireSettlementConfetti } from "../../lib/confetti";
import { PythPriceTicker } from "../../components/pyth-price-ticker";
import { W6AppShell } from "../../components/w6-app-shell";

/**
 * /sandbox — Devnet sandbox. Phantom required (we don't teach skipping the wallet step).
 * Funds are airdropped from devnet via /api/sandbox/airdrop.
 */
export default function SandboxPage() {
  const { connected, publicKey } = useWallet();
  const [funded, setFunded] = useState(false);
  const [funding, setFunding] = useState(false);

  async function handleFund() {
    if (!publicKey) return;
    setFunding(true);
    try {
      const res = await fetch("/api/sandbox/airdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: publicKey.toBase58() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "airdrop_failed");
      }
      await res.json();
      setFunded(true);
      fireSettlementConfetti();
      toast.success("Airdropped 0.5 SOL + 25 test-USDC. Try /send next.");
    } catch (e) {
      toast.error(`Airdrop failed: ${(e as Error).message}`);
    } finally {
      setFunding(false);
    }
  }

  return (
    <W6AppShell>
    <div className="mx-auto max-w-2xl">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="w6-heading" style={{ fontSize: 32, lineHeight: 1.1, margin: 0 }}>Devnet sandbox</h1>
        <PythPriceTicker />
      </div>
      <p className="mt-2 text-sm text-[#52525b]">
        Real Phantom wallet. Free devnet funds. Play with the full app for 5 minutes.
      </p>

      <div className="mt-8 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-8">
        {!connected ? (
          <div className="text-sm text-[#52525b]">
            Connect Phantom (top right) to start. We don&apos;t teach you to skip the wallet — but
            we&apos;ll airdrop devnet funds so you can play for free.
          </div>
        ) : !funded ? (
          <button
            onClick={() => void handleFund()}
            disabled={funding}
            className="w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
          >
            {funding ? "Airdropping…" : "Get $25 devnet USDC"}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-accent">
              ✓ Funded · 0.5 SOL + 25 test-USDC airdropped to your wallet
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <a
                href="/send"
                className="rounded-lg border border-[#e4e4e7] px-4 py-3 text-center hover:bg-[#f4f4f5]"
              >
                Try /send →
              </a>
              <a
                href="/agents"
                className="rounded-lg border border-[#e4e4e7] px-4 py-3 text-center hover:bg-[#f4f4f5]"
              >
                Hire an agent →
              </a>
              <a
                href="/watch"
                className="rounded-lg border border-[#e4e4e7] px-4 py-3 text-center hover:bg-[#f4f4f5]"
              >
                Watch agent demo →
              </a>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-[#71717a]">
        Devnet only. No real money. Architecture: server-side <code>requestAirdrop</code> +
        SPL test-USDC mint authority on devnet. Mainnet button disabled in sandbox. Rate-limited
        via Upstash Redis (1 airdrop per pubkey per 24h).
      </p>
    </div>
    </W6AppShell>
  );
}
